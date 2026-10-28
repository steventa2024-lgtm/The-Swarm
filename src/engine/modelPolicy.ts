import type { AgentDefinition, Provider } from '@/types'
export interface ModelChoice { model: string; effort?: string }
export interface ModelPolicy {
  profile: 'economy' | 'balanced' | 'performance' | 'manual'
  defaults: Record<string, ModelChoice>
  projects: Record<string, Record<string, ModelChoice>>
  locks: Record<string, ModelChoice>
  task: Record<string, ModelChoice>
  maxCalls: number
  timeoutSeconds: number
}
export const DEFAULT_MODEL_POLICY: ModelPolicy = { profile: 'balanced', defaults: {}, projects: {}, locks: {}, task: {}, maxCalls: 8, timeoutSeconds: 180 }
/** Provider changes are always explicit in Agents. Model resolution never changes provider. */
export function resolveModel(agent: AgentDefinition, projectId: string, providers: Provider[], policy: ModelPolicy): ModelChoice {
  const provider = providers.find((p) => p.id === agent.providerId)
  if (!provider || provider.status !== 'connected' || !provider.verified) throw new Error(`${agent.name}: provider unavailable. No fallback was used.`)
  const choice = policy.task[provider.id] ?? policy.locks[agent.id] ?? policy.projects[projectId]?.[provider.id] ?? policy.defaults[provider.id] ?? { model: agent.modelId }
  const model = provider.models.find((m) => m.id === choice.model)
  if (!model) throw new Error(`${agent.name}: requested model ${choice.model} is unavailable. Your selection was not changed.`)
  if (choice.effort && !model.efforts?.includes(choice.effort)) throw new Error(`${agent.name}: reasoning effort unavailable for this model.`)
  if (policy.profile === 'manual' && !policy.task[provider.id] && !policy.locks[agent.id]) throw new Error(`${agent.name}: Manual Lock requires an explicit model lock or task override.`)
  return choice
}

/** FIFO, one in-flight request per provider, across runs. Canceled jobs never start. */
const tails = new Map<string, Promise<void>>()
export async function providerQueue<T>(id: string, signal: AbortSignal | undefined, job: () => Promise<T>): Promise<T> {
  const previous = tails.get(id) ?? Promise.resolve()
  let release!: () => void
  const next = new Promise<void>((resolve) => { release = resolve })
  const tail = previous.catch(() => {}).then(() => next)
  tails.set(id, tail)
  await previous.catch(() => {})
  try { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); return await job() }
  finally { release(); if (tails.get(id) === tail) tails.delete(id) }
}
