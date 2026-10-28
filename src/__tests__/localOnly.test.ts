import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seedAgents, seedProviders } from '@/data/seed'
import { LocalOnlyError, routeModel } from '@/engine/routing'
import type { Provider } from '@/types'

;(globalThis as unknown as { window: unknown }).window = globalThis

// Any call that reaches a provider adapter is recorded; Local Only must keep this empty for hosted providers.
const sent: string[] = []
vi.mock('@/providers', () => ({
  isAbort: () => false,
  adapterFor: (p: Provider) => ({
    listModels: async () => [],
    chat: async () => { sent.push(p.id); throw new Error('network blocked in test') },
  }),
}))

const cloud = seedProviders.filter((p) => !p.local).map((p) => ({ ...p, status: 'connected' as const, verified: true }))
const ollama: Provider = { ...seedProviders.find((p) => p.id === 'ollama')!, status: 'connected', verified: true }
const planner = seedAgents.find((a) => a.role === 'planner')! // defaults to a hosted model

describe('routeModel — Local Only', () => {
  it('picks a local model and never the agent\'s hosted default', () => {
    for (let i = 0; i < 6; i++) {
      const r = routeModel(planner, 'local-only', [...cloud, ollama], i)
      expect(r.provider.local).toBe(true)
    }
  })

  it('throws instead of falling back to a hosted model when no local provider is connected', () => {
    expect(() => routeModel(planner, 'local-only', cloud, 0)).toThrow(LocalOnlyError)
    expect(() => routeModel(planner, 'local-only', [{ ...ollama, status: 'disconnected' }, ...cloud], 0)).toThrow(/Nothing was sent/)
  })

  it('other modes still fall back sensibly when their ideal pool is empty', () => {
    expect(() => routeModel(planner, 'balanced', cloud, 0)).not.toThrow()
    expect(() => routeModel(planner, 'eco', [ollama], 0)).not.toThrow() // falls back to any available model
  })
})

describe('starting a Local Only run with no local model', () => {
  beforeEach(() => { sent.length = 0 })

  it('ends as a failed run that explains why, and contacts no provider', async () => {
    const { useApp } = await import('@/store/app')
    const { useSwarm } = await import('@/store/swarm')
    useApp.setState({
      providers: cloud, // hosted providers only, all verified and connected
      preferences: { ...useApp.getState().preferences, orchestrator: 'live' },
    })
    useSwarm.setState({ mode: 'local-only', agentCount: 3 })
    useSwarm.getState().start({ prompt: 'Build a todo app', record: false })
    await new Promise((r) => setTimeout(r, 50))

    const run = useSwarm.getState().run!
    expect(run.status).toBe('failed')
    expect(run.events.map((e) => e.message).join(' ')).toMatch(/Local Only/)
    expect(sent).toEqual([]) // nothing was sent anywhere
    useSwarm.getState().reset()
  })

  it('runs normally on a local model when one is connected', async () => {
    const { useApp } = await import('@/store/app')
    const { useSwarm } = await import('@/store/swarm')
    useApp.setState({ providers: [...cloud, ollama] })
    useSwarm.setState({ mode: 'local-only', agentCount: 3 })
    useSwarm.getState().start({ prompt: 'Build a todo app', record: false })
    await new Promise((r) => setTimeout(r, 200))
    // The (stubbed) provider is called — and it is the local one, never a hosted one.
    expect(sent.length).toBeGreaterThan(0)
    expect(new Set(sent)).toEqual(new Set(['ollama']))
    useSwarm.getState().reset()
  })
})
