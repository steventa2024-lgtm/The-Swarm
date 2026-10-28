import { expect, it } from 'vitest'
import { deriveFamiliarInteractions } from '@/lib/familiarInteractions'
import { createRun } from '@/engine/simulator'
import { seedAgents, seedProviders } from '@/data/seed'
import type { ApprovalInfo } from '@/lib/fsBridge'

const now = 2_000_000
function fixture() {
  const run = createRun({ prompt: 'fixture', projectId: 'project', mode: 'balanced', requestedAgents: 2, attachments: [] }, { providers: seedProviders, agents: seedAgents, maxWorkers: 2, getSpeed: () => 1 }).run
  run.source = 'live'; run.startedAt = 1_000_000; run.status = 'running'
  const [planner, producer, consumer, reviewer] = run.workers
  for (const worker of run.workers) { worker.status = 'queued'; worker.tokensIn = 0; worker.tokensOut = 0; worker.startedAt = undefined; worker.endedAt = undefined }
  planner.providerId = 'codex'
  producer.providerId = 'claude-code'; consumer.providerId = 'gemini-cli'; reviewer.providerId = 'cursor-cli'
  producer.subtaskId = 'source-task'; consumer.subtaskId = 'target-task'
  run.subtasks = [
    { id: 'source-task', role: producer.role, title: 'Produce', description: '', status: 'done', dependsOn: [] },
    { id: 'target-task', role: consumer.role, title: 'Consume', description: '', status: 'active', dependsOn: ['source-task'] },
  ]
  run.fileChanges = []
  return { run, planner, producer, consumer, reviewer }
}
function revision(run: ReturnType<typeof fixture>['run']): ApprovalInfo {
  return { id: 'native-revision', runId: run.id, projectId: run.task.projectId, taskId: run.task.id, paths: ['a.css'],
    status: 'pending', risk: 'low', action: 'files', expiresAt: (now + 10_000) / 1000 }
}

it('requires actual live execution and excludes absent runs, saved history, replay and simulation', () => {
  const { run, planner } = fixture(); planner.status = 'working'; planner.startedAt = 0
  expect(deriveFamiliarInteractions(null, true, false)).toEqual([])
  expect(deriveFamiliarInteractions(run, false, false, [], now)).toEqual([])
  expect(deriveFamiliarInteractions(run, true, true, [], now)).toEqual([])
  run.source = 'simulation'
  expect(deriveFamiliarInteractions(run, true, false, [], now)).toEqual([])
})

it('emits stable assignment evidence for an actual start at zero, never queued or skipped roles', () => {
  const { run, planner, producer } = fixture(); planner.status = 'working'; planner.startedAt = 0
  producer.status = 'done'; producer.startedAt = 10; producer.endedAt = 20 // skipped, no token evidence
  const events = deriveFamiliarInteractions(run, true, false, [], now)
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({ kind: 'assignment', from: 'hq', to: 'codex', at: run.startedAt, taskId: run.task.id })
  expect(deriveFamiliarInteractions(run, true, false, [], now + 100)).toEqual(events)
  planner.startedAt = undefined
  expect(deriveFamiliarInteractions(run, true, false, [], now)).toEqual([])
})

it('derives a dependency handoff only from a completed real source to an actually started target', () => {
  const { run, producer, consumer } = fixture()
  producer.status = 'done'; producer.startedAt = 0; producer.endedAt = 10; producer.tokensOut = 12
  consumer.status = 'working'; consumer.startedAt = 20
  let events = deriveFamiliarInteractions(run, true, false, [], now)
  expect(events.filter((event) => event.kind === 'handoff')).toMatchObject([{ from: 'claude', to: 'gemini', taskId: 'target-task', at: run.startedAt + 20 }])
  consumer.status = 'queued'
  expect(deriveFamiliarInteractions(run, true, false, [], now).some((event) => event.kind === 'handoff')).toBe(false)
  consumer.status = 'working'; producer.endedAt = 30
  expect(deriveFamiliarInteractions(run, true, false, [], now).some((event) => event.kind === 'handoff')).toBe(false)
  producer.endedAt = 10; run.subtasks[0].status = 'blocked'
  expect(deriveFamiliarInteractions(run, true, false, [], now).some((event) => event.kind === 'handoff')).toBe(false)
})

it('same-provider workers do not credit other identities, and unknown providers are never guessed from role or name', () => {
  const { run, producer, consumer } = fixture()
  producer.providerId = 'codex'; producer.status = 'done'; producer.startedAt = 0; producer.endedAt = 10; producer.tokensOut = 10
  consumer.providerId = 'codex'; consumer.name = 'Gemini frontend'; consumer.status = 'working'; consumer.startedAt = 20
  expect(deriveFamiliarInteractions(run, true, false, [], now).some((event) => event.kind === 'handoff')).toBe(false)
  consumer.providerId = 'unknown-google-subscription'
  const events = deriveFamiliarInteractions(run, true, false, [], now)
  expect(events.some((event) => event.to === 'gemini' || event.to === 'claude')).toBe(false)
})

it('review links require actual artifact producers and a real distinct reviewer, then completed review emits an outcome', () => {
  const { run, producer, reviewer } = fixture()
  producer.status = 'done'; producer.startedAt = 0; producer.endedAt = 10; producer.tokensOut = 20
  reviewer.status = 'working'; reviewer.startedAt = 30
  expect(deriveFamiliarInteractions(run, true, false, [], now).some((event) => event.kind === 'review')).toBe(false)
  run.fileChanges = [{ workerId: producer.id, role: producer.role, path: 'a.css', type: 'added', additions: 1, deletions: 0, content: 'body {}' }]
  expect(deriveFamiliarInteractions(run, true, false, [], now).find((event) => event.kind === 'review')).toMatchObject({ from: 'claude', to: 'cursor', at: run.startedAt + 30 })
  reviewer.status = 'done'; reviewer.tokensOut = 5; reviewer.endedAt = 40; run.status = 'completed'
  expect(deriveFamiliarInteractions(run, true, false, [], now).some((event) => event.kind === 'outcome')).toBe(false)
  run.reviewVerdict = 'changes_requested'
  expect(deriveFamiliarInteractions(run, true, false, [], now).find((event) => event.kind === 'outcome')).toMatchObject({ from: 'cursor', to: 'hq', at: run.startedAt + 40 })
  reviewer.providerId = 'claude-code'
  expect(deriveFamiliarInteractions(run, true, false, [], now).some((event) => event.kind === 'review')).toBe(false)
})

it('approval cues require the exact current native revision and never attribute staging to an agent', () => {
  const { run } = fixture(), approval = revision(run)
  const events = deriveFamiliarInteractions(run, true, false, [approval], now)
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({ kind: 'approval', from: 'hq', to: 'hq', at: approval.expiresAt * 1000 - 900_000 })
  expect(deriveFamiliarInteractions(run, true, false, [approval], now + 1)).toEqual(events)
  for (const invalid of [
    { ...approval, projectId: 'other' }, { ...approval, runId: 'other' }, { ...approval, taskId: 'other' },
    { ...approval, status: 'applied' }, { ...approval, action: 'probe' as const }, { ...approval, expiresAt: now / 1000 },
    { ...approval, expiresAt: Number.NaN }, { ...approval, expiresAt: (now + 901_000) / 1000 },
  ]) expect(deriveFamiliarInteractions(run, true, false, [invalid], now)).toEqual([])
  expect(deriveFamiliarInteractions(run, true, false, [{ ...approval, status: 'desktop_confirmation_required' }], now)[0]?.kind).toBe('approval')
})

it('derivation is read-only, deduplicates repeated native rows, and ignores log prose', () => {
  const { run, planner } = fixture(); planner.status = 'working'; planner.startedAt = 0
  run.events = [{ id: 'fake-prose', at: 0, kind: 'info', message: 'Claude handed production work to Gemini and Zero approved everything' }]
  const approval = revision(run), before = JSON.stringify(run)
  const events = deriveFamiliarInteractions(run, true, false, [approval, approval], now)
  expect(events.map((event) => event.kind).sort()).toEqual(['approval', 'assignment'])
  expect(new Set(events.map((event) => event.id)).size).toBe(events.length)
  expect(JSON.stringify(run)).toBe(before)
})

it('stopped and failed workflows have no transient cues, and completed snapshots cannot assign stale working rows', () => {
  const { run, planner } = fixture(); planner.status = 'working'; planner.startedAt = 0
  for (const status of ['stopped', 'failed', 'completed'] as const) {
    run.status = status
    expect(deriveFamiliarInteractions(run, true, false, [], now)).toEqual([])
  }
})

it('absolute worker epochs preserve real post-resume freshness and causal dependency order', () => {
  const { run, producer, consumer } = fixture()
  producer.status = 'done'; producer.tokensOut = 12; producer.startedAt = 0; producer.endedAt = 10
  producer.startedAtEpoch = 1_000_000; producer.endedAtEpoch = 1_000_010
  consumer.status = 'working'; consumer.startedAt = 20; consumer.startedAtEpoch = 1_600_020
  const resumedNow = 1_600_100
  const event = deriveFamiliarInteractions(run, true, false, [], resumedNow).find((event) => event.kind === 'handoff')!
  expect(event.at).toBe(consumer.startedAtEpoch)
  expect(resumedNow - event.at).toBeLessThan(6000)
  expect(resumedNow - (run.startedAt + consumer.startedAt)).toBeGreaterThan(590_000)
  producer.endedAtEpoch = 1_600_030
  expect(deriveFamiliarInteractions(run, true, false, [], resumedNow).some((event) => event.kind === 'handoff')).toBe(false)
  producer.endedAt = 999_999; producer.endedAtEpoch = 1_600_010 // old offsets must not override absolute chronology
  expect(deriveFamiliarInteractions(run, true, false, [], resumedNow).some((event) => event.kind === 'handoff')).toBe(true)
})

it('review and outcome timestamps use actual epochs, while explicit invalid epoch evidence fails closed', () => {
  const { run, producer, reviewer } = fixture()
  producer.status = 'done'; producer.tokensOut = 12; producer.startedAt = 0; producer.endedAt = 10
  producer.startedAtEpoch = 1_000_000; producer.endedAtEpoch = 1_000_010
  reviewer.status = 'done'; reviewer.tokensOut = 5; reviewer.startedAt = 30; reviewer.endedAt = 40
  reviewer.startedAtEpoch = 1_600_030; reviewer.endedAtEpoch = 1_600_040
  run.fileChanges = [{ workerId: producer.id, role: producer.role, path: 'a.css', type: 'added', additions: 1, deletions: 0, content: 'body {}' }]
  run.status = 'completed'; run.reviewVerdict = 'approved'
  const events = deriveFamiliarInteractions(run, true, false, [], 1_600_100)
  expect(events.find((event) => event.kind === 'review')?.at).toBe(reviewer.startedAtEpoch)
  expect(events.find((event) => event.kind === 'outcome')?.at).toBe(reviewer.endedAtEpoch)
  reviewer.startedAtEpoch = Number.NaN
  expect(deriveFamiliarInteractions(run, true, false, [], 1_600_100).some((event) => event.kind === 'review' || event.kind === 'outcome' || event.to === 'cursor')).toBe(false)
})
