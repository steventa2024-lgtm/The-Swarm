import type {
  ActivityEvent, AgentDefinition, ActivityKind, AgentRole, Complexity, FileChange, FinalOutput, Metrics, Run,
  RunStatus, Subtask, TimelineEntry, Worker,
} from '@/types'
import { clamp, uid } from '@/lib/utils'
import {
  buildRoleScript, classifyComplexity, COMPLEXITY_AGENTS, hash, pickBlueprint,
  type Blueprint, type RoleScript,
} from './blueprints'
import type { DriverContext, OrchestratorDriver, RunController, RunRequest } from './driver'
import { routeModel } from './routing'

/** Tokens in a real agent loop dwarf raw generation (tool calls, context reads). */
const TOKEN_SCALE = 9
const PLAN_MS = 5200
const REVIEW_MS = 8500
const TICK_MS = 200

const WORKER_ROLES: AgentRole[] = ['frontend', 'backend', 'researcher', 'docs', 'qa']

interface Script {
  blueprint: Blueprint
  byWorker: Record<string, RoleScript>
  durations: Record<string, number>
  speedFactor: Record<string, number>
}

function titleFrom(prompt: string): string {
  const first = prompt.trim().split(/[.\n]/)[0].trim()
  return first.length > 64 ? `${first.slice(0, 61)}…` : first || 'Untitled task'
}

function emptyMetrics(): Metrics {
  return {
    tokensIn: 0, tokensOut: 0, costUsd: 0, throughput: 0,
    tokenSeries: [0], costSeries: [0], throughputSeries: [0],
    byProvider: [], filesChanged: 0, additions: 0, deletions: 0,
  }
}

function makeWorker(
  def: AgentDefinition, mode: RunRequest['mode'], ctx: DriverContext, index: number,
  summary: string, checklist: string[],
): Worker {
  const { provider, model } = routeModel(def, mode, ctx.providers, index)
  return {
    id: uid('wk'), agentId: def.id, role: def.role, name: def.name,
    providerId: provider.id, modelId: model.id, modelLabel: model.label,
    status: 'queued', progress: 0, summary, recentAction: 'Waiting for plan',
    activeFiles: [], additions: 0, deletions: 0, tokensIn: 0, tokensOut: 0, elapsedMs: 0,
    checklist: checklist.map((label, i) => ({ id: `c${i}`, label, done: false })),
  }
}

function pickDef(defs: DriverContext['agents'], role: AgentRole) {
  return defs.find((a) => a.role === role) ?? defs[0]
}

/** Build the initial (pre-plan) run plus the hidden script the simulator follows. */
export function createRun(req: RunRequest, ctx: DriverContext): { run: Run; script: Script } {
  const complexity: Complexity = classifyComplexity(req.prompt)
  const blueprint = pickBlueprint(req.prompt)
  const enabled = ctx.agents.filter((a) => a.enabled)

  const wanted = req.requestedAgents === 'auto' ? COMPLEXITY_AGENTS[complexity] : req.requestedAgents
  const available = [...blueprint.priority, ...WORKER_ROLES].filter(
    (r, i, arr) => arr.indexOf(r) === i && enabled.some((a) => a.role === r),
  )
  const roles = available.slice(0, clamp(Math.min(wanted, ctx.maxWorkers), 1, 4))

  const planner = makeWorker(pickDef(enabled, 'planner'), req.mode, ctx, 0, 'Analysing the task and building a plan', [
    'Classify complexity', 'Decompose subtasks', 'Assign workers', 'Route models',
  ])
  planner.status = 'working'
  planner.recentAction = 'Reading task and project memory'

  const script: Script = { blueprint, byWorker: {}, durations: {}, speedFactor: {} }
  const workers: Worker[] = roles.map((role, i) => {
    const rs = buildRoleScript(role, blueprint)!
    const w = makeWorker(pickDef(enabled, role), req.mode, ctx, i + 1, rs.summary, rs.checklist)
    script.byWorker[w.id] = rs
    return w
  })

  const reviewer = makeWorker(pickDef(enabled, 'reviewer'), req.mode, ctx, 0, 'Waiting for workers to finish', [
    'Review each diff', 'Resolve conflicts', 'Run quality gates', 'Compose final output',
  ])
  reviewer.recentAction = 'Waiting for workers'

  const complexityFactor = { low: 0.75, medium: 1, high: 1.3 }[complexity]
  for (const w of workers) {
    const tps = ctx.providers.flatMap((p) => p.models).find((m) => m.id === w.modelId)?.tokensPerSecond ?? 80
    const rs = script.byWorker[w.id]
    const base = 16000 + hash(w.id + rs.title) * 9000 // 16–25s
    script.durations[w.id] = base * complexityFactor * clamp(Math.sqrt(95 / tps), 0.65, 1.5)
    script.speedFactor[w.id] = tps
  }

  const task = {
    id: uid('task'), title: titleFrom(req.prompt), prompt: req.prompt, projectId: req.projectId,
    mode: req.mode, requestedAgents: req.requestedAgents, complexity, attachments: req.attachments,
  }

  const run: Run = {
    id: uid('run'), task, status: 'planning', subtasks: [], workers: [planner, ...workers, reviewer],
    events: [], fileChanges: [], timeline: [], metrics: emptyMetrics(), startedAt: Date.now(), elapsedMs: 0,
  }
  pushEvent(run, 'system', `Task received: “${task.title}”`)
  pushEvent(run, 'plan', `Complexity classified as ${complexity}; planning for ${workers.length} workers`, planner)
  run.timeline = deriveTimeline(run)
  return { run, script }
}

function pushEvent(run: Run, kind: ActivityKind, message: string, worker?: Worker) {
  const ev: ActivityEvent = {
    id: uid('ev'), at: run.elapsedMs, kind, message, workerId: worker?.id, role: worker?.role,
  }
  run.events = [ev, ...run.events].slice(0, 80)
}

function deriveTimeline(run: Run): TimelineEntry[] {
  const s = run.status
  const planned = s !== 'planning' && run.subtasks.length > 0
  const reviewing = s === 'reviewing' || s === 'completed'
  const done = s === 'completed'
  const mk = (id: string, label: string, status: TimelineEntry['status']): TimelineEntry => ({ id, label, at: 0, status })
  return [
    mk('received', 'Task received', 'done'),
    mk('plan', 'Plan created', planned ? 'done' : 'active'),
    mk('build', 'Workers building', done || reviewing ? 'done' : planned ? 'active' : 'pending'),
    mk('review', 'Review & merge', done ? 'done' : reviewing ? 'active' : 'pending'),
    mk('final', 'Final output', done ? 'done' : 'pending'),
  ]
}

function modelRates(ctx: DriverContext, w: Worker) {
  const m = ctx.providers.find((p) => p.id === w.providerId)?.models.find((x) => x.id === w.modelId)
  return { inCost: m?.inputCostPer1M ?? 0, outCost: m?.outputCostPer1M ?? 0, tps: m?.tokensPerSecond ?? 80 }
}

function addTokens(w: Worker, dt: number, tps: number, activity: number) {
  const out = (tps * activity * dt) / 1000 * TOKEN_SCALE * (0.8 + Math.random() * 0.4)
  w.tokensOut += out
  w.tokensIn += out * (2.6 + Math.random() * 1.2)
}

/** Advance a run by `dt` simulated milliseconds. Mutates a structural copy. */
export function stepRun(prev: Run, dt: number, script: Script, ctx: DriverContext): Run {
  if (prev.status === 'completed' || prev.status === 'stopped' || prev.status === 'failed' || prev.status === 'paused') return prev

  const run: Run = {
    ...prev,
    workers: prev.workers.map((w) => ({ ...w, checklist: w.checklist.map((c) => ({ ...c })) })),
    subtasks: prev.subtasks.map((s) => ({ ...s })),
  }
  run.elapsedMs += dt
  const planner = run.workers[0]
  const reviewer = run.workers[run.workers.length - 1]
  const workers = run.workers.slice(1, -1)

  const tickChecklist = (w: Worker) => {
    const n = w.checklist.length
    w.checklist.forEach((c, i) => { c.done = w.progress >= ((i + 1) / n) * 100 - 0.01 })
  }
  const runAction = (w: Worker, actions: string[], kind: ActivityKind) => {
    const idx = Math.min(actions.length - 1, Math.floor((w.progress / 100) * actions.length))
    const next = actions[idx]
    if (next && next !== w.recentAction) {
      w.recentAction = next
      pushEvent(run, kind, next, w)
    }
  }

  // ── Planning ─────────────────────────────
  if (run.status === 'planning') {
    const rates = modelRates(ctx, planner)
    planner.elapsedMs += dt
    planner.progress = clamp(planner.progress + (dt / PLAN_MS) * 100, 0, 100)
    addTokens(planner, dt, rates.tps, 0.55)
    tickChecklist(planner)
    runAction(planner, ['Reading task and project memory', 'Decomposing into subtasks', 'Mapping dependencies', 'Assigning workers and routing models'], 'plan')

    if (planner.progress >= 100) {
      planner.status = 'done'
      planner.endedAt = run.elapsedMs
      planner.recentAction = 'Plan delivered'
      planner.summary = `Split task into ${workers.length} subtasks`
      run.subtasks = workers.map((w): Subtask => {
        const rs = script.byWorker[w.id]
        return { id: uid('st'), title: rs.title, description: rs.description, role: w.role, status: 'active', dependsOn: [] }
      })
      workers.forEach((w, i) => {
        w.subtaskId = run.subtasks[i].id
        w.status = 'working'
        w.startedAt = run.elapsedMs
        w.summary = script.byWorker[w.id].description
        w.recentAction = 'Starting'
      })
      run.status = 'running'
      pushEvent(run, 'success', `Plan ready — ${workers.length} workers dispatched in parallel`, planner)
      for (const w of workers) pushEvent(run, 'info', `${w.name} started on “${script.byWorker[w.id].title}” via ${w.modelLabel}`, w)
    }
  }
  // ── Parallel build ───────────────────────
  else if (run.status === 'running') {
    for (const w of workers) {
      if (w.status !== 'working') continue
      const rs = script.byWorker[w.id]
      const rates = modelRates(ctx, w)
      w.elapsedMs += dt
      const jitter = 0.85 + Math.random() * 0.3
      w.progress = clamp(w.progress + (dt / script.durations[w.id]) * 100 * jitter, 0, 100)
      addTokens(w, dt, rates.tps, 0.4)
      tickChecklist(w)
      runAction(w, rs.actions, w.role === 'qa' ? 'test' : 'code')

      const m = rs.files.length
      const cur = Math.min(m - 1, Math.floor((w.progress / 100) * m))
      w.activeFiles = rs.files.slice(Math.max(0, cur - 1), cur + 1).map((x) => x.path).reverse()

      if (w.progress >= 100) {
        w.status = 'done'
        w.endedAt = run.elapsedMs
        w.activeFiles = []
        w.recentAction = 'Finished — awaiting review'
        const st = run.subtasks.find((s) => s.id === w.subtaskId)
        if (st) st.status = 'done'
        pushEvent(run, 'success', `${w.name} finished “${rs.title}”`, w)
      }
    }
    if (workers.every((w) => w.status === 'done')) {
      run.status = 'reviewing'
      reviewer.status = 'working'
      reviewer.startedAt = run.elapsedMs
      reviewer.summary = 'Reviewing diffs from all workers'
      pushEvent(run, 'review', `All workers finished — ${reviewer.name} starting review`, reviewer)
    }
  }
  // ── Review & merge ───────────────────────
  else if (run.status === 'reviewing') {
    const rates = modelRates(ctx, reviewer)
    reviewer.elapsedMs += dt
    reviewer.progress = clamp(reviewer.progress + (dt / REVIEW_MS) * 100, 0, 100)
    addTokens(reviewer, dt, rates.tps, 0.5)
    tickChecklist(reviewer)
    runAction(reviewer, ['Reviewing frontend and backend diffs', 'Checking for cross-worker conflicts', 'Running typecheck, lint and tests', 'Composing final output'], 'review')

    if (reviewer.progress >= 100) {
      reviewer.status = 'done'
      reviewer.endedAt = run.elapsedMs
      reviewer.recentAction = 'Merged and finalised'
      reviewer.summary = 'All worker output reviewed and merged'
      run.status = 'completed'
      pushEvent(run, 'success', 'Review passed — final output ready', reviewer)
    }
  }

  // ── Derived data ─────────────────────────
  const files: FileChange[] = []
  for (const w of workers) {
    const rs = script.byWorker[w.id]
    const m = rs.files.length
    let add = 0
    let del = 0
    rs.files.forEach((file, i) => {
      const frac = clamp((w.progress / 100 - i / m) / (1 / m), 0, 1)
      if (frac <= 0) return
      const h = hash(file.path)
      const a = Math.round((18 + h * 120) * frac)
      const d = file.type === 'added' ? 0 : Math.round((2 + hash(file.path + 'd') * 34) * frac)
      add += a
      del += d
      files.push({ path: file.path, type: file.type, additions: a, deletions: d, workerId: w.id, role: w.role })
    })
    w.additions = add
    w.deletions = del
  }
  run.fileChanges = files

  const m: Metrics = { ...run.metrics }
  m.tokensIn = run.workers.reduce((s, w) => s + w.tokensIn, 0)
  m.tokensOut = run.workers.reduce((s, w) => s + w.tokensOut, 0)
  const usage = new Map<string, { tokens: number; cost: number }>()
  let cost = 0
  for (const w of run.workers) {
    const r = modelRates(ctx, w)
    const c = (w.tokensIn / 1e6) * r.inCost + (w.tokensOut / 1e6) * r.outCost
    cost += c
    const u = usage.get(w.providerId) ?? { tokens: 0, cost: 0 }
    u.tokens += w.tokensIn + w.tokensOut
    u.cost += c
    usage.set(w.providerId, u)
  }
  m.costUsd = cost
  m.byProvider = [...usage.entries()].map(([providerId, u]) => ({ providerId, ...u })).sort((a, b) => b.tokens - a.tokens)
  const prevTotal = prev.metrics.tokensIn + prev.metrics.tokensOut
  const total = m.tokensIn + m.tokensOut
  m.throughput = m.throughput * 0.7 + ((total - prevTotal) / (dt / 1000)) * 0.3
  m.filesChanged = files.length
  m.additions = files.reduce((s, x) => s + x.additions, 0)
  m.deletions = files.reduce((s, x) => s + x.deletions, 0)
  if (Math.floor(run.elapsedMs / 1000) !== Math.floor(prev.elapsedMs / 1000) || run.status === 'completed') {
    m.tokenSeries = [...m.tokenSeries, total].slice(-48)
    m.costSeries = [...m.costSeries, cost].slice(-48)
    m.throughputSeries = [...m.throughputSeries, m.throughput].slice(-48)
  }
  run.metrics = m
  run.timeline = deriveTimeline(run)

  if (run.status === 'completed') run.finalOutput = buildFinal(run, script)
  return run
}

function buildFinal(run: Run, script: Script): FinalOutput {
  return {
    headline: `${run.task.title} — complete`,
    summary: script.blueprint.finalSummary,
    filesChanged: run.metrics.filesChanged,
    additions: run.metrics.additions,
    deletions: run.metrics.deletions,
    checks: [
      { label: 'Typecheck', passed: true },
      { label: 'Lint', passed: true },
      { label: 'Unit tests', passed: true },
      { label: 'No merge conflicts', passed: true },
    ],
    nextSteps: script.blueprint.nextSteps,
  }
}

/** In-browser stand-in for the real orchestrator. */
export const simulatedDriver: OrchestratorDriver = {
  start(req, ctx, onUpdate): RunController {
    const { run: initial, script } = createRun(req, ctx)
    let run = initial
    let resumeStatus: RunStatus = 'planning'
    let last = performance.now()
    let alive = true

    const emit = (r: Run) => { run = r; onUpdate(r) }
    // Fast-forward so the dashboard opens mid-flight instead of empty.
    for (let t = 0; t < (ctx.warmupMs ?? 0); t += TICK_MS) run = stepRun(run, TICK_MS, script, ctx)
    emit(run)

    const timer = window.setInterval(() => {
      const now = performance.now()
      const dt = Math.min(now - last, 600) * ctx.getSpeed()
      last = now
      if (!alive || run.status === 'paused') return
      const next = stepRun(run, dt, script, ctx)
      if (next !== run) emit(next)
      if (next.status === 'completed') dispose()
    }, TICK_MS)

    function dispose() {
      alive = false
      window.clearInterval(timer)
    }

    return {
      pause() {
        if (run.status === 'paused' || !['planning', 'running', 'reviewing'].includes(run.status)) return
        resumeStatus = run.status
        const paused: Run = {
          ...run, status: 'paused',
          workers: run.workers.map((w) => (w.status === 'working' ? { ...w, status: 'paused' as const } : w)),
        }
        pushEvent(paused, 'warning', 'Run paused')
        emit(paused)
      },
      resume() {
        if (run.status !== 'paused') return
        last = performance.now()
        const resumed: Run = {
          ...run, status: resumeStatus,
          workers: run.workers.map((w) => (w.status === 'paused' ? { ...w, status: 'working' as const } : w)),
        }
        pushEvent(resumed, 'info', 'Run resumed')
        emit(resumed)
      },
      stop() {
        if (run.status === 'completed' || run.status === 'stopped') return
        const stopped: Run = {
          ...run, status: 'stopped',
          workers: run.workers.map((w) => (w.status === 'working' || w.status === 'paused' || w.status === 'queued' ? { ...w, status: 'idle' as const } : w)),
        }
        pushEvent(stopped, 'warning', 'Run stopped by user')
        stopped.timeline = deriveTimeline(stopped)
        emit(stopped)
        dispose()
      },
      dispose,
    }
  },
}
