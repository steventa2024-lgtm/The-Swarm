import { afterEach, expect, it } from 'vitest'
import { useSwarm } from '@/store/swarm'
import { createRun } from '@/engine/simulator'
import { seedAgents, seedProviders } from '@/data/seed'

afterEach(() => useSwarm.getState().reset())
it('can scrub through active-looking recorded frames without treating them as live work', () => {
  const { run } = createRun({ prompt: 'Build a page', projectId: 'p', mode: 'balanced', requestedAgents: 2, attachments: [] }, { providers: seedProviders, agents: seedAgents, maxWorkers: 2, getSpeed: () => 1 })
  const store = useSwarm.getState()
  expect(store.openRun({ ...run, status: 'planning' }, true)).toBe(true)
  expect(store.openRun({ ...run, status: 'running' }, true)).toBe(true)
  expect(store.openRun({ ...run, status: 'completed' }, true)).toBe(true)
  expect(useSwarm.getState().replaying).toBe(true)
  expect(useSwarm.getState().runIsLive).toBe(false)
  store.reset()
  // A real active run must still be protected from replacement by replay.
  useSwarm.setState({ run: { ...run, status: 'running' }, replaying: false })
  expect(store.openRun({ ...run, status: 'completed' }, true)).toBe(false)
})
