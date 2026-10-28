import { expect, it } from 'vitest'
import { FAMILIARS, mascotState } from '@/data/familiars'
import { seedAgents, seedProviders } from '@/data/seed'
import { createRun } from '@/engine/simulator'
it('defines eight distinct original identities with correct asset/bot slots', () => { expect(FAMILIARS).toHaveLength(8); expect(new Set(FAMILIARS.map((f) => f.id)).size).toBe(8); expect(FAMILIARS.find((f) => f.id === 'deepseek')?.provider).toBe('deepseek') })
it('simulation cannot animate production work, and real worker states map honestly', () => {
  const run = createRun({ prompt: 'fixture', projectId: 'p', mode: 'balanced', requestedAgents: 2, attachments: [] }, { providers: seedProviders, agents: seedAgents, maxWorkers: 2, getSpeed: () => 1 }).run
  const provider = { ...seedProviders[0], id: 'codex', verified: true, status: 'connected' as const }
  run.workers[0].providerId = 'codex'; run.workers[0].status = 'working'; run.source = 'simulation'
  expect(mascotState('codex', [provider], run, false)).toBe('idle')
  run.source = 'live'; expect(mascotState('codex', [provider], run, false)).toBe('thinking')
  run.workers[0].status = 'error'; expect(mascotState('codex', [provider], run, false)).toBe('failed')
  expect(mascotState('claude', [], null, false)).toBe('offline')
})
