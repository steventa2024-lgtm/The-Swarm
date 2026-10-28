import { expect, it } from 'vitest'
import { FAMILIARS, mascotState } from '@/data/familiars'
import { seedAgents, seedProviders } from '@/data/seed'
import { createRun } from '@/engine/simulator'
import type { ApprovalInfo } from '@/lib/fsBridge'

const provider = { ...seedProviders[0], id: 'codex', verified: true, status: 'connected' as const }
function sample() {
  const run = createRun({ prompt: 'fixture', projectId: 'p', mode: 'balanced', requestedAgents: 2, attachments: [] }, { providers: seedProviders, agents: seedAgents, maxWorkers: 2, getSpeed: () => 1 }).run
  run.workers[0].providerId = 'codex'; run.workers[0].status = 'working'; run.source = 'live'
  return run
}
const nowMs = 1_000_000
function pending(run: ReturnType<typeof sample>): ApprovalInfo {
  return { id: 'f435535f-d80a-44ea-a814-f6fb2375f87c', runId: run.id, projectId: run.task.projectId, taskId: run.task.id,
    paths: ['styles.css'], expiresAt: nowMs / 1000 + 15, status: 'pending', risk: 'low', action: 'files' }
}

it('defines eight distinct original identities with correct asset/bot slots', () => {
  expect(FAMILIARS).toHaveLength(8)
  expect(new Set(FAMILIARS.map((f) => f.id)).size).toBe(8)
  expect(FAMILIARS.find((f) => f.id === 'deepseek')?.provider).toBe('deepseek')
})

it('requires an actual selected execution; saved live-source data cannot animate work', () => {
  const run = sample()
  expect(mascotState('codex', [provider], run, false)).toBe('idle')
  expect(mascotState('codex', [provider], run, false, false)).toBe('idle')
  expect(mascotState('codex', [provider], run, false, true)).toBe('thinking')
  run.workers[0].status = 'error'
  expect(mascotState('codex', [provider], run, false, true)).toBe('failed')
  expect(mascotState('codex', [provider], run, false, false)).toBe('idle')
  expect(mascotState('claude', [], null, false)).toBe('offline')
})

it('replay and simulation cannot work or celebrate, even when snapshots say live and done', () => {
  const run = sample()
  expect(mascotState('codex', [provider], run, true, true)).toBe('idle')
  run.workers[0].status = 'done'; run.workers[0].tokensOut = 12
  expect(mascotState('codex', [provider], run, false, true)).toBe('completed')
  expect(mascotState('codex', [provider], run, true, true)).toBe('idle')
  expect(mascotState('codex', [provider], run, false, false)).toBe('idle')
  run.source = 'simulation'
  expect(mascotState('codex', [provider], run, false, true)).toBe('idle')
})

it('keeps actual execution evidence separate from editable provider availability', () => {
  const run = sample()
  expect(mascotState('codex', [], run, false, true)).toBe('thinking')
  expect(mascotState('codex', [], run, false, false)).toBe('offline')
})

it('terminal snapshots cannot keep stale workers walking, and paused settled providers rest', () => {
  const run = sample()
  for (const status of ['stopped', 'failed', 'completed'] as const) {
    run.status = status
    expect(mascotState('codex', [provider], run, false, true)).toBe('idle')
  }
  run.status = 'paused'
  expect(mascotState('codex', [provider], run, false, true)).toBe('thinking') // in-flight work may settle while paused
  run.workers[0].status = 'done'; run.workers[0].tokensOut = 12
  expect(mascotState('codex', [provider], run, false, true)).toBe('idle')
  run.status = 'completed'
  expect(mascotState('codex', [provider], run, false, true)).toBe('completed')
  run.status = 'failed'; run.workers[0].status = 'error'
  expect(mascotState('codex', [provider], run, false, true)).toBe('failed')
})

it('HQ requires a current native revision rather than an approved model review', () => {
  const run = sample(); run.status = 'completed'; run.reviewVerdict = 'approved'
  expect(mascotState('hq', [provider], run, false, true)).toBe('idle')
  const revision = pending(run)
  expect(mascotState('hq', [provider], run, false, true, [revision], nowMs)).toBe('waiting_approval')
  expect(mascotState('hq', [provider], run, false, false, [revision], nowMs)).toBe('waiting_approval')
  expect(mascotState('hq', [provider], run, true, true, [revision], nowMs)).toBe('idle')
  expect(mascotState('hq', [provider], run, false, true, [], nowMs)).toBe('idle')
})

it('expires HQ approval state by the absolute deadline and excludes other revisions and consumed decisions', () => {
  const run = sample(), revision = pending(run)
  expect(mascotState('hq', [], run, false, true, [revision], revision.expiresAt * 1000)).toBe('idle')
  for (const changed of [
    { ...revision, projectId: 'other-project' }, { ...revision, runId: 'other-run' }, { ...revision, taskId: 'other-task' },
    { ...revision, id: '' }, { ...revision, expiresAt: Number.NaN }, { ...revision, status: 'applied' },
    { ...revision, status: 'rejected' }, { ...revision, status: 'apply_failed' }, { ...revision, action: 'probe' as const },
  ]) expect(mascotState('hq', [], run, false, true, [changed], nowMs)).toBe('idle')
  expect(mascotState('hq', [], run, false, true, [{ ...revision, status: 'desktop_confirmation_required' }], nowMs)).toBe('waiting_approval')
})
