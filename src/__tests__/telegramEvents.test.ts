import { expect, it } from 'vitest'
import { createRun } from '@/engine/simulator'
import { seedAgents, seedProviders } from '@/data/seed'
import { operationalEvents } from '@/lib/telegramEvents'

function sample() {
  return createRun({ prompt: 'PRIVATE_TASK_CONTENT', projectId: 'project-1', mode: 'balanced', requestedAgents: 2, attachments: ['private.key'] }, { providers: seedProviders, agents: seedAgents, maxWorkers: 2, getSpeed: () => 1 }).run
}
it('publishes references to real worker execution without sending private task contents', () => {
  const run = sample(); run.source = 'live'
  const worker = run.workers[1]
  worker.subtaskId = 'subtask-1'
  worker.status = 'done'; worker.tokensOut = 20; worker.summary = 'PRIVATE_SUMMARY'
  run.status = 'completed'; run.reviewVerdict = 'approved'
  const events = operationalEvents(run)
  expect(events.some((e) => e.kind === 'agent_assigned' && e.taskId === worker.subtaskId)).toBe(true)
  expect(events.some((e) => e.kind === 'workflow_finished' && e.projectId === 'project-1')).toBe(true)
  expect(JSON.stringify(events)).not.toMatch(/PRIVATE_|private.key/)
  expect(events.map((e) => e.id)).toEqual(operationalEvents(run).map((e) => e.id))
})
it('excludes simulation and skipped agents, and reports incomplete review as project attention', () => {
  const run = sample(); run.source = 'simulation'
  expect(operationalEvents(run)).toEqual([])
  run.source = 'live'; run.status = 'completed'; run.reviewVerdict = 'changes_requested'
  run.workers[1].status = 'done'; run.workers[1].tokensIn = 0; run.workers[1].tokensOut = 0
  const events = operationalEvents(run)
  expect(events.some((e) => e.kind === 'agent_assigned')).toBe(false)
  expect(events.some((e) => e.kind === 'project_attention')).toBe(true)
})
