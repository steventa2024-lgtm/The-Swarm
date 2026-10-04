import { adapterFor, isAbort, type ChatResult } from '@/providers'
import { skillFor } from '@/data/skills'
import { ROLE_META } from '@/lib/meta'
import { cleanPath, listTree, readText } from '@/lib/fsBridge'
import { paidTokens } from '@/lib/budget'
import { clamp, formatTokens, uid } from '@/lib/utils'
import type {
  ActivityKind, FileChange, FinalOutput, Metrics, Run, RunStatus, Subtask, TimelineEntry, Worker,
} from '@/types'
import type { DriverContext, OrchestratorDriver, RunController, RunRequest } from './driver'
import { createRun } from './simulator'

/**
 * Live orchestrator: the planner, each worker and the reviewer are real model
 * calls through the provider adapters. Worker output is *proposed* file
 * contents — nothing is written to disk yet.
 */

const PLAN_TOKENS = 1800
const WORKER_TOKENS = 2200
const REVIEW_TOKENS = 900
/** Used only to turn streamed token counts into a progress bar. */
const EXPECTED = { plan: 450, worker: 1100, review: 350 }
const FILE_HEADER = /^#{2,4}\s*FILE:\s*(.+?)\s*$/gm

interface PlannedSubtask {
  role?: string; title?: string; description?: string; files?: unknown; checklist?: unknown
  skip?: boolean; brief?: unknown; spec?: unknown; acceptance?: unknown
}

/** Pulls a JSON object out of model text: strips <think> blocks and code fences. */
export function extractJson<T>(raw: string): T | null {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/gi, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(text.slice(start, end + 1)) as T } catch { return null }
}

type ParsedFile = { path: string; lines: number; content: string }

/** Default names for unlabeled code blocks, so a bare ```html block still becomes a previewable page. */
const LANG_DEFAULT: Record<string, string> = {
  html: 'index.html', css: 'styles.css', javascript: 'app.js', js: 'app.js', jsx: 'src/App.jsx', tsx: 'src/App.tsx', markdown: 'README.md', md: 'README.md',
}
const NAME_IN = /([A-Za-z0-9_][\w./-]*\.[A-Za-z0-9]{1,6})/

/**
 * Fallback for models that ignore the `### FILE:` format and just emit fenced code.
 * The name comes from, in order: the fence info (```js app.js), the line above the fence
 * (**app.js**), a leading comment (// app.js), or a default for the language.
 */
function parseLenient(text: string): ParsedFile[] {
  const out = new Map<string, ParsedFile>()
  const lines = text.split('\n')
  let above = '' // last line seen outside a code block
  for (let i = 0; i < lines.length; i++) {
    const open = /^\s*```([\w+-]*)\s*(.*)$/.exec(lines[i])
    if (!open) { above = lines[i]; continue }

    // Collect the block body up to the closing fence (or the end, for text that is still streaming).
    const body: string[] = []
    i++
    while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++])

    const lang = open[1].toLowerCase()
    const code = body.join('\n')
    if (!code.trim() || /^(json|bash|sh|shell|console|text|txt|diff|powershell|cmd)$/.test(lang)) { above = ''; continue }

    const fromInfo = open[2].match(NAME_IN)?.[1]
    const fromAbove = /^[\s#*`>_-]*[\w./ -]*?([A-Za-z0-9_][\w./-]*\.[A-Za-z0-9]{1,6})[\s`*:_)-]*$/.exec(above)?.[1]
    const fromComment = /^\s*(?:\/\/|\/\*|<!--|#)\s*(?:file(?:name)?:\s*)?([A-Za-z0-9_][\w./-]*\.[A-Za-z0-9]{1,6})/i.exec(body[0] ?? '')?.[1]
    const path = (fromInfo ?? fromAbove ?? fromComment ?? LANG_DEFAULT[lang])?.replace(/^\/+/, '')
    above = ''
    if (!path) continue
    out.set(path, { path, lines: body.filter((l) => l.trim()).length, content: code + '\n' })
  }
  return [...out.values()]
}

/** Parses `### FILE: path` + fenced code blocks into proposed changes (falling back to bare fenced code). */
export function parseFiles(text: string): ParsedFile[] {
  const strict = parseHeaderFiles(text)
  return strict.length ? strict : parseLenient(text)
}

function parseHeaderFiles(text: string): ParsedFile[] {
  const out: ParsedFile[] = []
  const matches = [...text.matchAll(FILE_HEADER)]
  matches.forEach((m, i) => {
    const seg = text.slice((m.index ?? 0) + m[0].length, matches[i + 1]?.index ?? text.length)
    const open = seg.indexOf('```')
    if (open < 0) return
    const bodyStart = seg.indexOf('\n', open)
    if (bodyStart < 0) return
    const close = seg.indexOf('```', bodyStart)
    const body = seg.slice(bodyStart + 1, close < 0 ? undefined : close)
    out.push({
      path: m[1].replace(/[`*]/g, '').trim(),
      lines: body.split('\n').filter((l) => l.trim()).length,
      content: body.replace(/\n$/, '') + '\n',
    })
  })
  return out
}

const MAX_RETRIES = 3

/** Transient failures worth retrying: rate limits, overload and server hiccups. Auth/validation errors are not. */
export function isRetryable(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /HTTP (429|500|502|503|504|529)\b/.test(m) || /rate.?limit|overloaded|too many requests|temporarily unavailable/i.test(m)
}

/**
 * How long to wait before retry number `attempt` (0-based). Honours a "try again in 1.2s" hint when the
 * provider gives one; otherwise exponential backoff (base, 2.5×base, 6×base) with a little jitter.
 */
export function retryDelayMs(e: unknown, attempt: number, baseMs = 2000, rand: () => number = Math.random): number {
  const m = e instanceof Error ? e.message : String(e)
  const hint = /(?:try again|retry) (?:in|after) ([\d.]+)\s*(ms|s)\b/i.exec(m)
  if (hint) {
    const ms = Number(hint[1]) * (hint[2].toLowerCase() === 'ms' ? 1 : 1000)
    return Math.min(30_000, Math.max(baseMs / 2, ms + 250))
  }
  const factor = [1, 2.5, 6][Math.min(attempt, 2)]
  return Math.round(baseMs * factor * (0.85 + rand() * 0.3))
}

const shortError = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 90)

/** Sleep that ends early (by rejecting) when the run is stopped. */
const abortableSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { window.clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
  })

const firstParagraph = (text: string) =>
  text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim().split(/\n\s*\n|### FILE/)[0].replace(/\s+/g, ' ').slice(0, 170)

const str = (v: unknown, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback)
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : [])

export const liveDriver: OrchestratorDriver = {
  start(req: RunRequest, ctx: DriverContext, onUpdate: (run: Run) => void): RunController {
    const abort = new AbortController()
    const { signal } = abort

    if (ctx.providers.length === 0) {
      return failImmediately(req, ctx, onUpdate)
    }

    const { run, script } = createRun(req, ctx)

    // Strict budget: don't even start a run that would spend paid tokens once the daily limit is already used.
    const isPaid = (providerId: string) => !ctx.providers.find((p) => p.id === providerId)?.local
    const budget = ctx.budget
    if (budget && budget.mode === 'strict' && budget.usedBefore >= budget.limit && run.workers.some((w) => isPaid(w.providerId))) {
      return failImmediately(req, ctx, onUpdate, `Daily paid-token budget reached (${formatTokens(budget.usedBefore)} of ${formatTokens(budget.limit)}). Raise it in Settings, change the budget mode, or use local models.`, 'Budget reached')
    }
    const workers = run.workers.slice(1, -1)
    const planner = run.workers[0]
    const reviewer = run.workers[run.workers.length - 1]
    const outputs = new Map<string, string>() // workerId -> text
    const t0 = performance.now()
    let pausedAt: number | null = null
    let pausedTotal = 0
    let phase: RunStatus = 'planning'
    let finished = false
    let gate: { promise: Promise<void>; open: () => void } | null = null
    let emitTimer: number | undefined

    let lastRateAt = performance.now()
    let lastRateTotal = 0
    const rates = (w: Worker) => {
      const m = ctx.providers.find((p) => p.id === w.providerId)?.models.find((x) => x.id === w.modelId)
      return { inCost: m?.inputCostPer1M ?? 0, outCost: m?.outputCostPer1M ?? 0 }
    }

    const event = (kind: ActivityKind, message: string, w?: Worker) => {
      run.events = [{ id: uid('ev'), at: run.elapsedMs, kind, message, workerId: w?.id, role: w?.role }, ...run.events].slice(0, 80)
    }

    const timeline = (): TimelineEntry[] => {
      const planned = run.subtasks.length > 0
      const reviewing = phase === 'reviewing' || phase === 'completed'
      const done = phase === 'completed'
      const mk = (id: string, label: string, status: TimelineEntry['status']): TimelineEntry => ({ id, label, at: 0, status })
      return [
        mk('received', 'Task received', 'done'),
        mk('plan', 'Plan created', planned ? 'done' : 'active'),
        mk('build', 'Workers building', reviewing ? 'done' : planned ? 'active' : 'pending'),
        mk('review', 'Review & merge', done ? 'done' : reviewing ? 'active' : 'pending'),
        mk('final', 'Final output', done ? 'done' : 'pending'),
      ]
    }

    const recompute = (prev: Metrics) => {
      const m: Metrics = { ...prev }
      m.tokensIn = run.workers.reduce((s, w) => s + w.tokensIn, 0)
      m.tokensOut = run.workers.reduce((s, w) => s + w.tokensOut, 0)
      const usage = new Map<string, { tokens: number; cost: number }>()
      let cost = 0
      for (const w of run.workers) {
        const r = rates(w)
        const c = (w.tokensIn / 1e6) * r.inCost + (w.tokensOut / 1e6) * r.outCost
        cost += c
        const u = usage.get(w.providerId) ?? { tokens: 0, cost: 0 }
        u.tokens += w.tokensIn + w.tokensOut
        u.cost += c
        usage.set(w.providerId, u)
      }
      m.costUsd = cost
      m.byProvider = [...usage.entries()].map(([providerId, u]) => ({ providerId, ...u })).sort((a, b) => b.tokens - a.tokens)
      const total = m.tokensIn + m.tokensOut
      const now = performance.now()
      const dt = (now - lastRateAt) / 1000
      if (dt >= 0.5) {
        m.throughput = m.throughput * 0.6 + (Math.max(0, total - lastRateTotal) / dt) * 0.4
        lastRateAt = now
        lastRateTotal = total
      }
      return m
    }

    const refreshFiles = () => {
      const files: FileChange[] = []
      for (const w of workers) {
        // A model may emit the same file more than once (small ones often loop). Within one worker, the last
        // version of a path wins — otherwise repeats look like a conflict between agents and inflate the counts.
        const latest = new Map<string, { path: string; lines: number; content: string }>()
        for (const f of parseFiles(outputs.get(w.id) ?? '')) {
          const path = cleanPath(f.path)
          if (path) { latest.delete(path); latest.set(path, { ...f, path }) } // delete+set keeps "most recent last" order
        }
        const unique = [...latest.values()]
        w.activeFiles = unique.slice(-2).map((f) => f.path).reverse()
        w.additions = unique.reduce((s, f) => s + f.lines, 0)
        w.deletions = 0
        for (const f of unique) files.push({ path: f.path, type: 'added', additions: f.lines, deletions: 0, workerId: w.id, role: w.role, content: f.content })
      }
      run.fileChanges = files
      run.metrics.filesChanged = files.length
      run.metrics.additions = files.reduce((s, f) => s + f.additions, 0)
      run.metrics.deletions = 0
    }

    // Paid-token budget: warn at 80%, and at 100% either stop (Strict) or keep going with a warning (Balanced).
    let budgetStage = 0
    const checkBudget = () => {
      const b = ctx.budget
      if (!b || b.mode === 'unlimited' || b.limit <= 0 || finished || signal.aborted) return
      const mine = paidTokens(run.metrics, ctx.providers)
      if (mine === 0) return // nothing paid is being spent, so there is nothing for the budget to protect
      const total = b.usedBefore + mine
      const pct = (total / b.limit) * 100
      const used = `${formatTokens(total)} of ${formatTokens(b.limit)}`
      if (pct >= 100 && budgetStage < 2) {
        budgetStage = 2
        if (b.mode === 'strict') {
          event('warning', `Daily paid-token budget reached (${used}) — stopping the run to protect your limit`)
          abort.abort()
          gate?.open()
        } else {
          event('warning', `Over the daily paid-token budget (${used}). Balanced mode lets the run continue.`)
        }
      } else if (pct >= 80 && budgetStage < 1) {
        budgetStage = 1
        event('warning', `80% of the daily paid-token budget used (${used})`)
      }
    }

    let lastSample = 0
    const snapshot = (): Run => {
      refreshFiles()
      run.elapsedMs = (pausedAt ?? performance.now()) - t0 - pausedTotal
      for (const w of run.workers) if (w.status === 'working') w.elapsedMs = run.elapsedMs - (w.startedAt ?? 0)
      run.metrics = recompute(run.metrics)
      checkBudget()
      const sec = Math.floor(run.elapsedMs / 1000)
      if (sec !== lastSample) {
        lastSample = sec
        const m = run.metrics
        m.tokenSeries = [...m.tokenSeries, m.tokensIn + m.tokensOut].slice(-48)
        m.costSeries = [...m.costSeries, m.costUsd].slice(-48)
        m.throughputSeries = [...m.throughputSeries, m.throughput].slice(-48)
      }
      // A finished run must never read "paused" (e.g. Stop pressed while paused).
      const terminal = phase === 'completed' || phase === 'failed' || phase === 'stopped'
      run.status = terminal ? phase : pausedAt !== null ? 'paused' : phase
      run.timeline = timeline()
      return {
        ...run,
        workers: run.workers.map((w) => ({ ...w, checklist: w.checklist.map((c) => ({ ...c })) })),
        subtasks: run.subtasks.map((s) => ({ ...s })),
        metrics: { ...run.metrics },
      }
    }

    const emit = () => { if (!finished || phase === 'completed' || phase === 'failed' || phase === 'stopped') onUpdate(snapshot()) }
    const scheduleEmit = () => {
      if (emitTimer !== undefined) return
      emitTimer = window.setTimeout(() => { emitTimer = undefined; emit() }, 120)
    }
    const ticker = window.setInterval(() => { if (!finished) emit() }, 400)

    /** Call before any state change in an async stage: after Stop, nothing may start or mutate the run. */
    const throwIfAborted = () => { if (signal.aborted) throw new DOMException('Aborted', 'AbortError') }
    const waitIfPaused = async () => { if (gate) await gate.promise; throwIfAborted() }

    const tickChecklist = (w: Worker) => {
      const n = w.checklist.length
      w.checklist.forEach((c, i) => { c.done = w.progress >= ((i + 1) / n) * 100 - 0.01 })
    }

    /** Runs one model call for a worker, keeping its progress/tokens live. */
    const call = async (
      w: Worker,
      messages: { role: 'system' | 'user'; content: string }[],
      maxTokens: number,
      expected: number,
      opts: { json?: boolean; onText?: (full: string) => void } = {},
    ): Promise<ChatResult> => {
      throwIfAborted()
      const provider = ctx.providers.find((p) => p.id === w.providerId)!
      let text = ''
      w.tokensIn = Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4)
      w.tokensOut = 0

      // Rate limits and overload are normal with several agents hitting one paid API. Retry with
      // backoff — but only if nothing has streamed yet, otherwise we'd duplicate partial output.
      let result: ChatResult
      for (let attempt = 0; ; attempt++) {
        try {
          result = await adapterFor(provider).chat(provider, {
            model: w.modelId, messages, maxTokens, json: opts.json, signal,
            onDelta: (d) => {
              text += d
              w.tokensOut = Math.ceil(text.length / 4)
              w.progress = clamp((w.tokensOut / expected) * 100, w.progress, 96)
              tickChecklist(w)
              opts.onText?.(text)
              scheduleEmit()
            },
          })
          break
        } catch (e) {
          if (isAbort(e) || text.length > 0 || attempt >= MAX_RETRIES || !isRetryable(e)) throw e
          const wait = retryDelayMs(e, attempt, ctx.retryBaseMs ?? 2000)
          const secs = Math.max(1, Math.round(wait / 1000))
          w.recentAction = `Rate limited — retrying in ${secs}s`
          event('warning', `${w.name}: ${provider.name} is busy (${shortError(e)}). Retrying in ${secs}s (${attempt + 1}/${MAX_RETRIES})`, w)
          scheduleEmit()
          await abortableSleep(wait, signal)
        }
      }
      w.tokensIn = result.usage.inputTokens
      w.tokensOut = result.usage.outputTokens
      return result
    }

    // Project memory goes to the planner only. It folds anything relevant into the briefs, so the
    // (more numerous) workers don't each pay for notes they may not need.
    const notes = ctx.projectNotes ? `\n\nProject notes (from the team's memory):\n${ctx.projectNotes}` : ''
    const project = ctx.projectName ? `Project: ${ctx.projectName}\n` : ''

    // With an approved folder, give the team the real file tree and existing contents.
    let treeNote = ''
    const loadTree = async () => {
      if (!ctx.projectRoot) return
      try {
        const files = await listTree(ctx.projectRoot, 200)
        if (files.length) treeNote = `\n\nProject files (partial list):\n${files.join('\n')}`
        event('info', `Read ${files.length} project files for context`, planner)
      } catch (e) {
        event('warning', `Could not read the project folder: ${errMsg(e)}`, planner)
      }
    }
    const loadExisting = async (paths: string[]): Promise<string> => {
      if (!ctx.projectRoot) return ''
      let out = ''
      for (const raw of paths.slice(0, 4)) {
        const p = cleanPath(raw)
        if (!p || out.length > 20_000) continue
        try {
          const r = await readText(ctx.projectRoot, p, 8000)
          if (r.exists && !r.binary) out += `\n\n--- Current contents of ${p}${r.truncated ? ' (truncated)' : ''} ---\n${r.content}`
        } catch { /* unreadable file: skip it */ }
      }
      return out
    }

    const skillOf = (w: Worker) => skillFor(w.role, ctx.agents.find((a) => a.id === w.agentId)?.skill)

    // What the planner hands each agent. Workers see this instead of the whole master prompt.
    interface Brief { brief: string; spec: string; acceptance: string[]; skip: boolean; reason: string }
    const briefs = new Map<string, Brief>()
    let contract = ''
    let planSummary = ''

    // ── pipeline ──────────────────────────────────────────────
    const runPlanner = async () => {
      planner.startedAt = 0
      throwIfAborted()
      event('plan', `Planner (${planner.modelLabel}) is reading the master prompt`, planner)
      await loadTree()
      const roleList = workers.map((w) => `- ${w.role}: ${ROLE_META[w.role].label}`).join('\n')
      const system = `${skillOf(planner)}\n\nReply with a single JSON object and nothing else.`
      const user =
        `${project}MASTER PROMPT:\n${req.prompt}${notes}${treeNote}\n\n` +
        `Agents available (at most one subtask each):\n${roleList}\n\n` +
        'Rules: the master prompt always wins; project notes are background and apply only where they genuinely fit the request. ' +
        'Include a brief for EVERY listed role (or mark it skip). ' +
        'Unless the master prompt or the project files clearly call for a framework, plan a dependency-free static web app ' +
        '(index.html, styles.css, app.js) so it can be previewed by opening index.html. ' +
        'In "files", use project-relative paths (no leading slash) and prefer existing paths from the project list when changing existing code.\n\n' +
        'JSON shape: {"summary":"<2 sentences>","contract":"<shared decisions: file layout, names, signatures, data shapes>",' +
        '"subtasks":[{"role":"<role>","skip":false,"title":"<short title>","brief":"<self-contained instructions>",' +
        '"spec":"<requirements quoted from the master prompt that concern this role, max 600 chars>",' +
        '"acceptance":["<criterion>","<criterion>"],"files":["<path owned by this role>"],' +
        '"checklist":["<2-4 word step>","<step>","<step>","<step>"]}]}'

      const res = await call(planner, [{ role: 'system', content: system }, { role: 'user', content: user }], PLAN_TOKENS, EXPECTED.plan, { json: true })
      planner.progress = 100
      const parsed = extractJson<{ summary?: unknown; contract?: unknown; subtasks?: PlannedSubtask[] }>(res.text)
      const planned = parsed?.subtasks ?? []
      if (planned.length === 0) event('warning', 'Planner returned no usable JSON — falling back to the built-in plan', planner)
      contract = str(parsed?.contract)
      planSummary = str(parsed?.summary)

      // Skipping idle roles saves tokens, but never skip everyone.
      const wantsSkip = (role: string) => planned.find((x) => x.role === role)?.skip === true
      const skipAll = workers.every((w) => wantsSkip(w.role))

      // Each file belongs to exactly one role; earlier roles keep it.
      const owner = new Map<string, string>()

      run.subtasks = workers.map((w): Subtask => {
        const fallback = script.byWorker[w.id]
        const p = planned.find((x) => x.role === w.role)
        const checklist = strList(p?.checklist).slice(0, 4)
        if (checklist.length >= 2) w.checklist = checklist.map((label, i) => ({ id: `c${i}`, label, done: false }))

        // Models often write "/src/x.js" or "./x.js"; both mean project-relative.
        const files = strList(p?.files).map((f) => cleanPath(f.replace(/^\/+/, ''))).filter((f): f is string => !!f).slice(0, 6).filter((f) => {
          if (owner.has(f) && owner.get(f) !== w.id) { event('warning', `${f} was assigned to two agents — kept for the first`, planner); return false }
          owner.set(f, w.id)
          return true
        })
        // The simulator's placeholder paths mean nothing for a real task: with no usable list, let the model choose.
        fallback.files = files.map((path) => ({ path, type: 'added' as const }))

        const title = str(p?.title, fallback.title)
        const description = str(p?.description, fallback.description)
        const skip = !skipAll && wantsSkip(w.role)
        const brief = str(p?.brief, planned.length ? description : `${description}\n\nMaster prompt:\n${req.prompt.slice(0, 2000)}`)
        briefs.set(w.id, { brief, spec: str(p?.spec).slice(0, 900), acceptance: strList(p?.acceptance).slice(0, 5), skip, reason: skip ? 'The planner found nothing for this role.' : '' })
        w.brief = brief
        w.summary = skip ? 'Not needed for this task' : description
        w.recentAction = skip ? 'Skipped' : 'Queued'
        return { id: uid('st'), title, description, role: w.role, status: 'pending', dependsOn: [] }
      })
      workers.forEach((w, i) => { w.subtaskId = run.subtasks[i].id })
      const active = workers.filter((w) => !briefs.get(w.id)?.skip).length
      planner.status = 'done'
      planner.endedAt = run.elapsedMs
      planner.recentAction = 'Plan delivered'
      planner.summary = planSummary || `Split task into ${active} subtasks`
      planner.checklist.forEach((c) => { c.done = true })
      event('success', `Plan ready — ${active} of ${workers.length} agents have work${active < workers.length ? ' (others skipped to save tokens)' : ''}`, planner)
    }

    const runWorker = async (w: Worker) => {
      throwIfAborted() // a worker whose turn comes after Stop must not start (or touch the run at all)
      const st = run.subtasks.find((s) => s.id === w.subtaskId)!
      const fallback = script.byWorker[w.id]
      const b = briefs.get(w.id)!

      if (b.skip) {
        w.status = 'done'
        w.progress = 100
        w.startedAt = run.elapsedMs
        w.endedAt = run.elapsedMs
        w.checklist.forEach((c) => { c.done = true })
        w.recentAction = 'Skipped — no work for this role'
        st.status = 'done'
        event('info', `${w.name} skipped: nothing for this role, no tokens spent`, w)
        return
      }

      w.status = 'working'
      w.startedAt = run.elapsedMs
      w.recentAction = 'Reading brief'
      st.status = 'active'
      event('info', `${w.name} picked up “${st.title}” via ${w.modelLabel}`, w)

      const system =
        `${skillOf(w)}\n\n` +
        'OUTPUT FORMAT: first a 2-3 sentence summary of your approach. Then, for each file you own, a header line exactly like\n' +
        '### FILE: path/to/file.ext\nfollowed by a fenced code block with the full proposed contents. Use project-relative paths. ' +
        'If a file already exists, output its complete updated contents (not a patch). Write nothing else. Keep files concise.'
      const files = fallback.files.map((f) => f.path)
      // Parallel workers must not clobber each other: say what's theirs and what isn't.
      const others = workers.filter((x) => x.id !== w.id).flatMap((x) => script.byWorker[x.id].files.map((f) => f.path))
      const ownership =
        (files.length ? `Files you own: ${files.join(', ')}` : 'You own no files yet: create only NEW files that fit your role (for example tests/… or docs/…).') +
        (others.length ? `\nFiles owned by other agents — never write these: ${others.join(', ')}` : '')
      const existing = await loadExisting(files)
      // The full master prompt is only sent when it's tiny; otherwise the brief + quoted spec carry it.
      const master = req.prompt.length <= 600 ? `\n\nMaster prompt: ${req.prompt}` : ''
      const user =
        `${project}Shared contract (follow it exactly):\n${contract || '(none — use sensible names and keep to your own files)'}\n\n` +
        `Your task: ${st.title}\n${b.brief}${b.spec ? `\n\nFrom the master prompt:\n${b.spec}` : ''}${master}` +
        `${b.acceptance.length ? `\n\nAcceptance criteria:\n${b.acceptance.map((a) => `- ${a}`).join('\n')}` : ''}` +
        `\n\n${ownership}${existing}`

      let lastFile = ''
      try {
        const res = await call(w, [{ role: 'system', content: system }, { role: 'user', content: user }], WORKER_TOKENS, EXPECTED.worker, {
          onText: (full) => {
            outputs.set(w.id, full)
            const para = firstParagraph(full)
            if (para) w.summary = para
            const parsedFiles = parseFiles(full)
            const cur = parsedFiles[parsedFiles.length - 1]?.path
            if (cur && cur !== lastFile) {
              lastFile = cur
              w.recentAction = `Writing ${cur}`
              event('code', `Writing ${cur}`, w)
            } else if (!cur) w.recentAction = 'Drafting approach'
          },
        })
        outputs.set(w.id, res.text)
        w.progress = 100
        w.checklist.forEach((c) => { c.done = true })
        w.status = 'done'
        w.endedAt = run.elapsedMs
        w.recentAction = 'Finished — awaiting review'
        st.status = 'done'
        event('success', `${w.name} finished “${st.title}”`, w)
      } catch (e) {
        if (isAbort(e)) throw e
        w.status = 'error'
        w.endedAt = run.elapsedMs
        w.recentAction = errMsg(e)
        st.status = 'blocked'
        event('warning', `${w.name} failed: ${errMsg(e)}`, w)
      }
    }

    const runReviewer = async () => {
      throwIfAborted()
      reviewer.status = 'working'
      reviewer.startedAt = run.elapsedMs
      reviewer.summary = 'Checking the work against each agent\'s acceptance criteria'
      reviewer.recentAction = 'Reading worker output'
      event('review', `All workers finished — ${reviewer.name} starting review`, reviewer)

      // Reviewers are premium but low-volume: send a compact digest, not whole files.
      const digest = workers
        .filter((w) => !briefs.get(w.id)?.skip)
        .map((w) => {
          const text = outputs.get(w.id) ?? ''
          const parsedFiles = parseFiles(text)
          const files = parsedFiles.map((f) => `${f.path} (${f.lines} lines)`).join(', ') || 'no files'
          const excerpt = parsedFiles.slice(0, 2).map((f) => `--- ${f.path} ---\n${f.content.slice(0, 900)}`).join('\n')
          const acc = briefs.get(w.id)?.acceptance ?? []
          return `## ${ROLE_META[w.role].label} — ${w.status}\nSummary: ${firstParagraph(text) || w.recentAction}\n` +
            `${acc.length ? `Acceptance: ${acc.join(' | ')}\n` : ''}Files: ${files}${excerpt ? `\n${excerpt}` : ''}`
        })
        .join('\n\n')
      const system = `${skillOf(reviewer)}\n\nReply with a single JSON object and nothing else.`
      const user =
        `Master prompt: ${req.prompt.slice(0, 1500)}${req.prompt.length > 1500 ? '…' : ''}\n\n` +
        `${contract ? `Shared contract:\n${contract}\n\n` : ''}${digest}\n\n` +
        'JSON shape: {"verdict":"approve"|"changes_requested","summary":["<3 short bullets on what was delivered>"],' +
        '"issues":["<file + problem; may be empty>"],"nextSteps":["<1-3 concrete next steps>"]}'

      const res = await call(reviewer, [{ role: 'system', content: system }, { role: 'user', content: user }], REVIEW_TOKENS, EXPECTED.review, { json: true })
      reviewer.progress = 100
      reviewer.checklist.forEach((c) => { c.done = true })
      reviewer.status = 'done'
      reviewer.endedAt = run.elapsedMs
      reviewer.recentAction = 'Merged and finalised'
      reviewer.summary = 'All worker output reviewed'

      const verdict = extractJson<{ verdict?: string; summary?: unknown; issues?: unknown; nextSteps?: unknown }>(res.text)
      const failed = workers.filter((w) => w.status === 'error').length
      const worked = workers.filter((w) => !briefs.get(w.id)?.skip)
      const approved = verdict?.verdict === 'approve' && failed === 0
      const summary = strList(verdict?.summary)
      const issues = strList(verdict?.issues)
      refreshFiles()
      const out: FinalOutput = {
        headline: `${run.task.title} — ${approved ? 'complete' : 'needs attention'}`,
        summary: summary.length ? summary : worked.map((w) => `${ROLE_META[w.role].short}: ${w.summary}`),
        filesChanged: run.metrics.filesChanged,
        additions: run.metrics.additions,
        deletions: 0,
        checks: [
          { label: `${worked.length - failed}/${worked.length} agents completed`, passed: failed === 0 },
          { label: verdict ? `Reviewer: ${verdict.verdict === 'approve' ? 'approved' : 'changes requested'}` : 'Reviewer verdict unreadable', passed: approved },
        ],
        nextSteps: [...issues.map((i) => `Resolve: ${i}`), ...strList(verdict?.nextSteps), 'Proposed files are only written to your project when you review and apply them.'],
      }
      run.finalOutput = out
      event(approved ? 'success' : 'warning', approved ? 'Review passed — final output ready' : 'Review finished with open issues', reviewer)
    }

    const pipeline = async () => {
      try {
        await runPlanner()
        phase = 'running'
        emit()
        await waitIfPaused()
        // Wait for every worker to settle (not just the first failure) so none can touch the run after we finalise.
        const settled = await Promise.allSettled(workers.map(async (w, i) => { await new Promise((r) => setTimeout(r, i * 150)); await runWorker(w) }))
        const failure = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
        if (failure) throw failure.reason
        if (workers.every((w) => w.status === 'error')) throw new Error('Every worker failed — check the provider connection and model names.')
        phase = 'reviewing'
        emit()
        await waitIfPaused()
        await runReviewer()
        phase = 'completed'
      } catch (e) {
        if (isAbort(e) || signal.aborted) {
          phase = 'stopped'
        } else {
          phase = 'failed'
          const active = run.workers.find((w) => w.status === 'working')
          if (active) { active.status = 'error'; active.recentAction = errMsg(e) }
          event('warning', errMsg(e))
        }
      } finally {
        if (phase === 'stopped') {
          for (const w of run.workers) if (w.status === 'working' || w.status === 'queued') w.status = 'idle'
        }
        finished = true
        window.clearInterval(ticker)
        if (emitTimer !== undefined) window.clearTimeout(emitTimer)
        onUpdate(snapshot())
      }
    }

    emit()
    void pipeline()

    return {
      pause() {
        if (pausedAt !== null || finished) return
        pausedAt = performance.now()
        let open!: () => void
        gate = { promise: new Promise<void>((r) => { open = r }), open }
        event('warning', 'Run paused — in-flight requests finish, the next stage waits')
        emit()
      },
      resume() {
        if (pausedAt === null) return
        pausedTotal += performance.now() - pausedAt
        pausedAt = null
        gate?.open()
        gate = null
        event('info', 'Run resumed')
        emit()
      },
      stop() {
        if (finished) return
        event('warning', 'Run stopped by user')
        abort.abort()
        gate?.open()
      },
      dispose() {
        abort.abort()
        gate?.open()
        window.clearInterval(ticker)
        if (emitTimer !== undefined) window.clearTimeout(emitTimer)
      },
    }
  },
}

function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 220)
}

/** No verified provider: surface a failed run with an actionable message instead of a silent no-op. */
function failImmediately(
  req: RunRequest, ctx: DriverContext, onUpdate: (run: Run) => void,
  message = 'No verified provider. Open Integrations and connect one (e.g. Ollama) before starting a live run.',
  action = 'No verified provider',
): RunController {
  const { run } = createRun(req, { ...ctx, providers: [{ id: 'none', name: 'none', kind: 'ollama', endpoint: '', local: true, status: 'connected', models: [{ id: 'none', label: 'No provider', tier: 'local', contextWindow: 0, inputCostPer1M: 0, outputCostPer1M: 0, tokensPerSecond: 1 }] }] })
  run.status = 'failed'
  run.workers.forEach((w) => { w.status = 'idle'; w.recentAction = '—' })
  run.workers[0].status = 'error'
  run.workers[0].recentAction = action
  run.events = [{ id: uid('ev'), at: 0, kind: 'warning', message }, ...run.events]
  queueMicrotask(() => onUpdate(run))
  return { pause() {}, resume() {}, stop() {}, dispose() {} }
}
