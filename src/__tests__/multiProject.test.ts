import { expect, it, vi } from 'vitest'
import { seedAgents, seedProviders } from '@/data/seed'
import { createRun } from '@/engine/simulator'
import { useSwarm } from '@/store/swarm'
vi.mock('@/persistence/flightRecorder', () => ({ recordFrame: vi.fn(), recoverFlight: vi.fn() }))
it('project switching restores its actual snapshot without re-running tools or granting apply', () => {
  const run = createRun({ prompt: 'fixture', projectId: 'one', mode: 'balanced', requestedAgents: 2, attachments: [] }, { providers: seedProviders, agents: seedAgents, maxWorkers: 2, getSpeed: () => 1 }).run
  useSwarm.setState({ projectRuns: { one: run } })
  useSwarm.getState().activateProject('two'); expect(useSwarm.getState().run).toBeNull()
  useSwarm.getState().activateProject('one'); expect(useSwarm.getState().run?.id).toBe(run.id)
  expect(useSwarm.getState().runIsLive).toBe(false); expect(useSwarm.getState().applyOpen).toBe(false)
})
