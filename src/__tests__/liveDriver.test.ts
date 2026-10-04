import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedAgents } from '@/data/seed'
import type { DriverContext } from '@/engine/driver'
import type { ChatRequest } from '@/providers'
import type { Provider, Run } from '@/types'

// The driver uses window timers; give the node test environment one.
;(globalThis as unknown as { window: unknown }).window = globalThis

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const abortError = () => new DOMException('Aborted', 'AbortError')

const calls: { role: 'planner' | 'worker' | 'reviewer'; messages: ChatRequest['messages'] }[] = []
let plannerSkips: string[] = []
/** How many upcoming worker calls should fail, and with what message. */
let failures = 0
let failMessage = 'HTTP 429: {"error":{"message":"Rate limit reached. Please try again in 20ms"}}'

/** A fake provider: slow, streams text, and honours abort like the real transport. */
vi.mock('@/providers', () => ({
  isAbort: (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
  adapterFor: () => ({
    listModels: async () => ['fake'],
    chat: async (_p: Provider, req: ChatRequest) => {
      const system = req.messages[0].content
      const role = req.json ? (system.includes('Reviewer') ? 'reviewer' : 'planner') : 'worker'
      calls.push({ role, messages: req.messages })
      if (req.signal?.aborted) throw abortError()
      if (role === 'worker' && failures > 0) { failures--; throw new Error(failMessage) }

      let text: string
      if (role === 'planner') {
        text = JSON.stringify({
          summary: 'plan', contract: 'shared contract',
          subtasks: ['backend', 'frontend', 'qa'].map((r) => ({
            role: r, skip: plannerSkips.includes(r), title: `${r} task`, brief: `brief for ${r}`, spec: `spec for ${r}`,
            acceptance: ['works'], files: [`${r}.js`], checklist: ['a', 'b', 'c', 'd'],
          })),
        })
      } else if (role === 'reviewer') {
        text = JSON.stringify({ verdict: 'approve', summary: ['ok'], issues: [], nextSteps: [] })
      } else {
        text = 'Summary of approach.\n\n### FILE: out.js\n```js\nconsole.log(1)\n```\n'
      }
      const slow = role === 'worker' ? 25 : 5
      const pieces = text.match(/[\s\S]{1,20}/g) ?? []
      for (const piece of pieces) {
        await sleep(slow)
        if (req.signal?.aborted) throw abortError()
        req.onDelta?.(piece)
      }
      return { text, usage: { inputTokens: 100, outputTokens: 50, estimated: false } }
    },
  }),
}))

const { liveDriver, isRetryable, retryDelayMs } = await import('@/engine/liveDriver')

const provider: Provider = {
  id: 'fake', name: 'Fake', kind: 'ollama', endpoint: '', local: true, status: 'connected', verified: true,
  models: [{ id: 'fake', label: 'Fake', tier: 'local', contextWindow: 8000, inputCostPer1M: 0, outputCostPer1M: 0, tokensPerSecond: 40 }],
}
const ctx = (): DriverContext => ({ providers: [provider], agents: seedAgents, maxWorkers: 4, getSpeed: () => 1, retryBaseMs: 5 })

// A master prompt longer than the 600-char threshold, with a sentinel only the planner should ever see.
const LONG_PROMPT = `Build a thing. ${'Details about the thing. '.repeat(40)} SENTINEL-FULL-PROMPT`

const req = (prompt = LONG_PROMPT) => ({ prompt, projectId: 'p', mode: 'balanced' as const, requestedAgents: 3 as const, attachments: [] })

let latest: Run | null = null
const start = () => liveDriver.start(req(), ctx(), (r) => { latest = r })
const until = async (cond: () => boolean, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (cond()) return true; await sleep(20) } return false }
const workersWorking = () => latest?.workers.slice(1, -1).filter((w) => w.status === 'working').length ?? 0

beforeEach(() => { calls.length = 0; plannerSkips = []; failures = 0; failMessage = 'HTTP 429: {"error":{"message":"Rate limit reached. Please try again in 20ms"}}'; latest = null })
afterEach(() => { vi.restoreAllMocks() })

describe('live driver — token-saving behaviour', () => {
  it('runs plan → workers → review to completion', async () => {
    start()
    expect(await until(() => latest?.status === 'completed')).toBe(true)
    expect(calls.map((c) => c.role)).toEqual(['planner', 'worker', 'worker', 'worker', 'reviewer'])
    expect(latest!.finalOutput?.checks.every((c) => c.passed)).toBe(true)
  })

  it('shows only the planner the full master prompt; workers get their brief + contract', async () => {
    start()
    await until(() => latest?.status === 'completed')
    const full = (c: (typeof calls)[number]) => c.messages.map((m) => m.content).join('\n').includes('SENTINEL-FULL-PROMPT')
    expect(full(calls.find((c) => c.role === 'planner')!)).toBe(true)
    for (const w of calls.filter((c) => c.role === 'worker')) {
      expect(full(w)).toBe(false)
      const text = w.messages.map((m) => m.content).join('\n')
      expect(text).toContain('shared contract')
      expect(text).toMatch(/brief for (backend|frontend|qa)/)
    }
  })

  it('skips a role the planner marks as unneeded, spending nothing on it', async () => {
    plannerSkips = ['qa']
    start()
    await until(() => latest?.status === 'completed')
    expect(calls.filter((c) => c.role === 'worker')).toHaveLength(2)
    const qa = latest!.workers.find((w) => w.role === 'qa')!
    expect(qa.status).toBe('done')
    expect(qa.tokensIn + qa.tokensOut).toBe(0)
    expect(qa.recentAction).toMatch(/Skipped/)
  })

  it('never skips every role', async () => {
    plannerSkips = ['backend', 'frontend', 'qa']
    start()
    await until(() => latest?.status === 'completed')
    expect(calls.filter((c) => c.role === 'worker').length).toBeGreaterThan(0)
  })

  it('each worker is told which files belong to other agents', async () => {
    start()
    await until(() => latest?.status === 'completed')
    const backend = calls.filter((c) => c.role === 'worker').find((c) => c.messages[1].content.includes('brief for backend'))!
    expect(backend.messages[1].content).toMatch(/never write these:.*frontend\.js/)
  })
})

describe('live driver — Stop', () => {
  it('stops cleanly in the middle of the worker phase and stays stopped', async () => {
    const ctl = start()
    expect(await until(() => workersWorking() > 0)).toBe(true)
    ctl.stop()
    expect(await until(() => latest?.status === 'stopped')).toBe(true)

    const snapshot = JSON.stringify({ calls: calls.length, ev: latest!.events.length, tok: latest!.metrics.tokensIn + latest!.metrics.tokensOut })
    await sleep(500)
    expect(workersWorking()).toBe(0)
    expect(JSON.stringify({ calls: calls.length, ev: latest!.events.length, tok: latest!.metrics.tokensIn + latest!.metrics.tokensOut })).toBe(snapshot)
  })

  it('REGRESSION: a worker whose staggered start comes after Stop must not start', async () => {
    const ctl = start()
    // Wait for the first worker only; the others are still in their start-up stagger.
    expect(await until(() => workersWorking() >= 1 && workersWorking() < 3)).toBe(true)
    ctl.stop()
    await until(() => latest?.status === 'stopped')
    const before = { calls: calls.length, ev: latest!.events.length }
    await sleep(600)
    expect(workersWorking()).toBe(0)
    expect(calls.length).toBe(before.calls)
    expect(latest!.events.length).toBe(before.ev)
    expect(latest!.workers.slice(1, -1).every((w) => w.status !== 'working')).toBe(true)
  })

  it('stops during planning without starting any worker', async () => {
    const ctl = start()
    await sleep(30)
    ctl.stop()
    expect(await until(() => latest?.status === 'stopped')).toBe(true)
    await sleep(300)
    expect(calls.filter((c) => c.role === 'worker')).toHaveLength(0)
  })
})

describe('live driver — Pause / Resume', () => {
  it('holds the next stage while paused and continues on resume', async () => {
    const ctl = start()
    expect(await until(() => workersWorking() > 0)).toBe(true)
    ctl.pause()
    expect(latest!.status).toBe('paused')
    // In-flight workers finish, but the reviewer must not start while paused.
    await until(() => latest!.workers.slice(1, -1).every((w) => w.status === 'done'))
    await sleep(300)
    expect(calls.some((c) => c.role === 'reviewer')).toBe(false)
    expect(latest!.status).toBe('paused')

    ctl.resume()
    expect(await until(() => latest?.status === 'completed')).toBe(true)
    expect(calls.some((c) => c.role === 'reviewer')).toBe(true)
  })

  it('stopping while paused releases the hold and ends the run', async () => {
    const ctl = start()
    await until(() => workersWorking() > 0)
    ctl.pause()
    await until(() => latest!.workers.slice(1, -1).every((w) => w.status === 'done'))
    ctl.stop()
    expect(await until(() => latest?.status === 'stopped')).toBe(true)
    expect(calls.some((c) => c.role === 'reviewer')).toBe(false)
  })
})

describe('live driver — rate limits and overload', () => {
  it('retries a rate-limited worker instead of failing it, and says so in the feed', async () => {
    failures = 2 // the first two worker calls hit a 429
    start()
    expect(await until(() => latest?.status === 'completed', 10_000)).toBe(true)
    expect(latest!.workers.slice(1, -1).every((w) => w.status === 'done')).toBe(true)
    expect(latest!.events.filter((e) => /Retrying in/.test(e.message)).length).toBe(2)
    // 3 workers + 2 failed attempts (retried) = 5 worker-role calls
    expect(calls.filter((c) => c.role === 'worker')).toHaveLength(5)
  })

  it('gives up after the retry limit and reports the worker as failed (the run still finishes)', async () => {
    failures = 999
    start()
    expect(await until(() => ['completed', 'failed'].includes(latest?.status ?? ''), 10_000)).toBe(true)
    // every worker failed → the run fails with a clear message rather than hanging
    expect(latest!.status).toBe('failed')
    expect(latest!.events.some((e) => /failed|Every worker failed/.test(e.message))).toBe(true)
    // 3 workers × (1 try + 3 retries)
    expect(calls.filter((c) => c.role === 'worker')).toHaveLength(12)
  })

  it('does NOT retry errors that retrying cannot fix (e.g. a bad key)', async () => {
    failures = 999
    failMessage = 'HTTP 401: {"error":{"message":"Incorrect API key provided"}}'
    start()
    await until(() => ['completed', 'failed'].includes(latest?.status ?? ''), 10_000)
    expect(calls.filter((c) => c.role === 'worker')).toHaveLength(3) // one attempt each, no retries
    expect(latest!.events.some((e) => /Retrying/.test(e.message))).toBe(false)
  })

  it('Stop interrupts the wait between retries', async () => {
    failures = 999
    const slow = { ...ctx(), retryBaseMs: 60_000 } // would wait a minute
    const ctl = liveDriver.start(req(), slow, (r) => { latest = r })
    expect(await until(() => latest?.events.some((e) => /Retrying in/.test(e.message)) ?? false)).toBe(true)
    const t = Date.now()
    ctl.stop()
    expect(await until(() => latest?.status === 'stopped', 2000)).toBe(true)
    expect(Date.now() - t).toBeLessThan(1500)
  })
})

describe('retry helpers', () => {
  it('retries rate limits, overload and server errors but not auth or validation errors', () => {
    for (const m of ['HTTP 429: x', 'HTTP 503: x', 'HTTP 529: Overloaded', 'HTTP 500: boom', 'The model is overloaded', 'Rate limit reached', 'Too many requests']) {
      expect(isRetryable(new Error(m)), m).toBe(true)
    }
    for (const m of ['HTTP 401: bad key', 'HTTP 400: invalid request', 'HTTP 404: model not found', 'No API key found for X']) {
      expect(isRetryable(new Error(m)), m).toBe(false)
    }
  })
  it('honours a "try again in" hint from the provider', () => {
    expect(retryDelayMs(new Error('Please try again in 1.5s'), 0, 2000)).toBe(1750)
    expect(retryDelayMs(new Error('retry after 800ms'), 0, 2000)).toBe(1050)
    expect(retryDelayMs(new Error('try again in 999s'), 0, 2000)).toBe(30_000) // capped
  })
  it('backs off exponentially without a hint', () => {
    const fixed = () => 0.5 // no jitter
    expect([0, 1, 2, 3].map((i) => retryDelayMs(new Error('HTTP 429'), i, 1000, fixed))).toEqual([1000, 2500, 6000, 6000])
  })
})

describe('live driver — daily paid-token budget', () => {
  const paid: Provider = { ...provider, id: 'paid', name: 'Paid API', local: false }
  const withBudget = (budget: DriverContext['budget'], p: Provider = paid): DriverContext => ({ ...ctx(), providers: [p], budget })
  const go = (c: DriverContext) => liveDriver.start(req(), c, (r) => { latest = r })
  const finishedOrStopped = () => ['completed', 'failed', 'stopped'].includes(latest?.status ?? '')

  it('Strict: refuses to start a paid run when today\'s budget is already used up — and spends nothing', async () => {
    go(withBudget({ mode: 'strict', limit: 1000, usedBefore: 1000 }))
    expect(await until(finishedOrStopped)).toBe(true)
    expect(latest!.status).toBe('failed')
    expect(latest!.events[0].message).toMatch(/budget reached/i)
    expect(calls).toHaveLength(0)
  })

  it('Strict: stops a run part-way when it reaches the limit', async () => {
    go(withBudget({ mode: 'strict', limit: 300, usedBefore: 0 }))
    expect(await until(finishedOrStopped, 8000)).toBe(true)
    expect(latest!.status).toBe('stopped')
    expect(latest!.events.some((e) => /budget reached.*stopping/i.test(e.message))).toBe(true)
    expect(calls.length).toBeLessThan(5) // a full run is planner + 3 workers + reviewer
    const frozen = calls.length
    await sleep(400)
    expect(calls.length).toBe(frozen)
    expect(workersWorking()).toBe(0)
  })

  it('Balanced: warns when over the limit but lets the run finish', async () => {
    go(withBudget({ mode: 'balanced', limit: 300, usedBefore: 0 }))
    expect(await until(finishedOrStopped, 8000)).toBe(true)
    expect(latest!.status).toBe('completed')
    expect(latest!.events.filter((e) => /Over the daily paid-token budget/.test(e.message))).toHaveLength(1) // once, not every tick
  })

  it('Off: no budget messages at all', async () => {
    go(withBudget({ mode: 'unlimited', limit: 10, usedBefore: 999_999 }))
    await until(finishedOrStopped, 8000)
    expect(latest!.status).toBe('completed')
    expect(latest!.events.some((e) => /budget/i.test(e.message))).toBe(false)
  })

  it('local models are free: Strict never blocks or stops an all-local run, however "used up" the budget looks', async () => {
    go(withBudget({ mode: 'strict', limit: 1, usedBefore: 5_000_000 }, provider)) // `provider` is local
    expect(await until(finishedOrStopped, 8000)).toBe(true)
    expect(latest!.status).toBe('completed')
    expect(latest!.events.some((e) => /budget/i.test(e.message))).toBe(false)
  })
})
