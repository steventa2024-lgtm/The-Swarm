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

const { liveDriver } = await import('@/engine/liveDriver')

const provider: Provider = {
  id: 'fake', name: 'Fake', kind: 'ollama', endpoint: '', local: true, status: 'connected', verified: true,
  models: [{ id: 'fake', label: 'Fake', tier: 'local', contextWindow: 8000, inputCostPer1M: 0, outputCostPer1M: 0, tokensPerSecond: 40 }],
}
const ctx = (): DriverContext => ({ providers: [provider], agents: seedAgents, maxWorkers: 4, getSpeed: () => 1 })

// A master prompt longer than the 600-char threshold, with a sentinel only the planner should ever see.
const LONG_PROMPT = `Build a thing. ${'Details about the thing. '.repeat(40)} SENTINEL-FULL-PROMPT`

const req = (prompt = LONG_PROMPT) => ({ prompt, projectId: 'p', mode: 'balanced' as const, requestedAgents: 3 as const, attachments: [] })

let latest: Run | null = null
const start = () => liveDriver.start(req(), ctx(), (r) => { latest = r })
const until = async (cond: () => boolean, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (cond()) return true; await sleep(20) } return false }
const workersWorking = () => latest?.workers.slice(1, -1).filter((w) => w.status === 'working').length ?? 0

beforeEach(() => { calls.length = 0; plannerSkips = []; latest = null })
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
