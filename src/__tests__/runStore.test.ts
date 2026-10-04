import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Run } from '@/types'

// An in-memory stand-in for SQLite / localStorage.
const mem = new Map<string, string>()
vi.mock('@/persistence/storage', () => ({
  appStorage: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => { mem.set(k, v) },
    removeItem: async (k: string) => { mem.delete(k) },
  },
}))

const { saveRun, listRuns, loadRun, deleteRun, clearRuns, prepareForStorage, MAX_RUNS, MAX_CONTENT_BYTES } = await import('@/persistence/runStore')

const KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789'

function makeRun(over: Partial<Run> & { id: string }, files: { path: string; content?: string }[] = []): Run {
  return {
    task: { id: 't', title: 'Build a todo app', prompt: 'Build a todo app', projectId: 'p1', mode: 'balanced', requestedAgents: 3, complexity: 'low', attachments: [] },
    status: 'completed', subtasks: [], workers: [], events: [], timeline: [], elapsedMs: 1000, startedAt: Date.now(),
    metrics: { tokensIn: 0, tokensOut: 0, costUsd: 0, throughput: 0, tokenSeries: [], costSeries: [], throughputSeries: [], byProvider: [], filesChanged: 0, additions: 0, deletions: 0 },
    fileChanges: files.map((f) => ({ path: f.path, type: 'added' as const, additions: 1, deletions: 0, workerId: 'w', role: 'frontend' as const, content: f.content })),
    ...over,
  } as Run
}

beforeEach(() => mem.clear())

describe('saving and reopening runs', () => {
  it('round-trips a run, including the files the agents wrote', async () => {
    await saveRun(makeRun({ id: 'a' }, [{ path: 'index.html', content: '<h1>hi</h1>' }]), { redact: false })
    expect((await listRuns()).map((m) => m.id)).toEqual(['a'])
    const back = await loadRun('a')
    expect(back?.task.title).toBe('Build a todo app')
    expect(back?.fileChanges[0].content).toBe('<h1>hi</h1>')
  })

  it('lists newest first and records how many distinct files each run has', async () => {
    await saveRun(makeRun({ id: 'old', startedAt: 1000 }, [{ path: 'a.js', content: 'x' }]), { redact: false })
    await saveRun(makeRun({ id: 'new', startedAt: 2000 }, [{ path: 'a.js', content: 'x' }, { path: 'a.js', content: 'y' }, { path: 'b.js', content: 'z' }]), { redact: false })
    const list = await listRuns()
    expect(list.map((m) => m.id)).toEqual(['new', 'old'])
    expect(list[0].files).toBe(2) // a.js counted once
  })

  it('saving the same run again replaces it rather than duplicating', async () => {
    await saveRun(makeRun({ id: 'a', status: 'running' as Run['status'] }), { redact: false })
    await saveRun(makeRun({ id: 'a', status: 'completed' }), { redact: false })
    const list = await listRuns()
    expect(list).toHaveLength(1)
    expect(list[0].status).toBe('completed')
  })

  it('keeps only the newest MAX_RUNS and deletes the rest from storage', async () => {
    for (let i = 0; i < MAX_RUNS + 4; i++) await saveRun(makeRun({ id: `r${i}`, startedAt: i }), { redact: false })
    const list = await listRuns()
    expect(list).toHaveLength(MAX_RUNS)
    expect(list[0].id).toBe(`r${MAX_RUNS + 3}`)
    expect(await loadRun('r0')).toBeNull() // evicted — and actually removed, not just un-indexed
    expect([...mem.keys()].filter((k) => k.startsWith('zp-runs/r'))).toHaveLength(MAX_RUNS)
  })

  it('delete and clear remove runs completely', async () => {
    await saveRun(makeRun({ id: 'a' }), { redact: false })
    await saveRun(makeRun({ id: 'b' }), { redact: false })
    await deleteRun('a')
    expect((await listRuns()).map((m) => m.id)).toEqual(['b'])
    expect(await loadRun('a')).toBeNull()
    expect(await clearRuns()).toBe(1)
    expect(await listRuns()).toEqual([])
    expect([...mem.keys()].filter((k) => k.startsWith('zp-runs/') && k !== 'zp-runs/index')).toEqual([])
  })

  it('returns safe defaults for missing or corrupt data', async () => {
    expect(await listRuns()).toEqual([])
    expect(await loadRun('nope')).toBeNull()
    mem.set('zp-runs/index', '{not json')
    mem.set('zp-runs/bad', '{also not json')
    expect(await listRuns()).toEqual([])
    expect(await loadRun('bad')).toBeNull()
  })
})

describe('redaction on save', () => {
  const run = () => makeRun({
    id: 's',
    task: { id: 't', title: 'Use ' + KEY, prompt: `My key is ${KEY} and password = "hunter2hunter2"`, projectId: 'p', mode: 'balanced', requestedAgents: 3, complexity: 'low', attachments: [] },
    events: [{ id: 'e', at: 0, kind: 'info', message: `called with ${KEY}` }],
  }, [{ path: 'config.js', content: `const password = "hunter2hunter2"\nconst key = "${KEY}"` }])

  it('masks secrets in prompts, titles and logs, and credentials in files — but not ordinary code', async () => {
    await saveRun(run(), { redact: true })
    const raw = mem.get('zp-runs/s')!
    expect(raw).not.toContain(KEY)
    const back = (await loadRun('s'))!
    expect(back.task.prompt).toContain('[REDACTED]')
    expect(back.task.prompt).not.toContain('hunter2')
    expect(back.events[0].message).not.toContain(KEY)
    // File contents: the provider key is gone, but the code's own password literal is left as written.
    expect(back.fileChanges[0].content).toContain('password = "hunter2hunter2"')
    expect(back.fileChanges[0].content).not.toContain(KEY)
  })

  it('stores everything as-is when redaction is off', async () => {
    await saveRun(run(), { redact: false })
    expect(mem.get('zp-runs/s')).toContain(KEY)
  })
})

describe('size limits', () => {
  it('drops contents of files beyond the size budget but keeps their paths, and flags the run as trimmed', async () => {
    const big = 'x'.repeat(Math.floor(MAX_CONTENT_BYTES * 0.6))
    const r = makeRun({ id: 'big' }, [{ path: 'a.js', content: big }, { path: 'b.js', content: big }, { path: 'c.js', content: 'small' }])
    const { run, trimmed } = prepareForStorage(r, { redact: false })
    expect(trimmed).toBe(true)
    expect(run.fileChanges.map((f) => f.path)).toEqual(['a.js', 'b.js', 'c.js'])
    expect(run.fileChanges[0].content).toBeDefined()
    expect(run.fileChanges[1].content).toBeUndefined()
    await saveRun(r, { redact: false })
    expect((await listRuns())[0].trimmed).toBe(true)
  })

  it('caps the number of stored events', () => {
    const events = Array.from({ length: 500 }, (_, i) => ({ id: `e${i}`, at: i, kind: 'info' as const, message: `m${i}` }))
    expect(prepareForStorage(makeRun({ id: 'e', events }), { redact: false }).run.events).toHaveLength(200)
  })

  it('does not mutate the live run it was given', () => {
    const r = makeRun({ id: 'm' }, [{ path: 'a.js', content: `k=${KEY}` }])
    prepareForStorage(r, { redact: true })
    expect(r.fileChanges[0].content).toContain(KEY)
  })
})
