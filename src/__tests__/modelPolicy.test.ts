import { expect, it } from 'vitest'
import { DEFAULT_MODEL_POLICY, resolveModel, providerQueue } from '@/engine/modelPolicy'
import { seedAgents, seedProviders } from '@/data/seed'
it('honors explicit task, absolute agent lock, project and global precedence', () => {
  const provider = { ...seedProviders[0], status: 'connected' as const, verified: true, models: ['task', 'locked', 'project', 'global'].map((id) => ({ ...seedProviders[0].models[0], id })) }
  const agent = { ...seedAgents[0], providerId: provider.id, modelId: 'global' }
  const p = { ...DEFAULT_MODEL_POLICY, defaults: { [provider.id]: { model: 'global' } }, projects: { p: { [provider.id]: { model: 'project' } } }, locks: { [agent.id]: { model: 'locked' } }, task: { [provider.id]: { model: 'task' } } }
  expect(resolveModel(agent, 'p', [provider], p).model).toBe('task')
  p.task = {}; expect(resolveModel(agent, 'p', [provider], p).model).toBe('locked')
  p.locks[agent.id].model = 'missing'; expect(() => resolveModel(agent, 'p', [provider], p)).toThrow(/unavailable/)
})
it('serializes a provider and discards canceled queued work', async () => {
  let release!: () => void; const order: number[] = [], abort = new AbortController()
  const a = providerQueue('test', undefined, async () => { order.push(1); await new Promise<void>((r) => { release = r }); order.push(2) })
  const b = providerQueue('test', abort.signal, async () => { order.push(3) }).catch(() => order.push(4))
  await new Promise((r) => setTimeout(r, 0)); abort.abort(); release(); await Promise.all([a, b]); expect(order).toEqual([1, 2, 4])
})
