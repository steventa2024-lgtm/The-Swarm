import type { AgentDefinition, ModelInfo, Provider, RunMode } from '@/types'

export interface RoutedModel {
  provider: Provider
  model: ModelInfo
}

/** Local Only was requested but no local model is available. Never worked around: that would send data off the machine. */
export class LocalOnlyError extends Error {
  constructor() {
    super('Local Only mode needs a connected local model (Ollama or llama.cpp), and none is available. Nothing was sent to any provider.')
    this.name = 'LocalOnlyError'
  }
}

const blended = (m: ModelInfo) => m.inputCostPer1M * 3 + m.outputCostPer1M

/**
 * Chooses a provider/model for an agent given the run mode.
 * `index` rotates among near-equal candidates so a swarm spreads across
 * providers instead of hammering one endpoint.
 */
export function routeModel(
  agent: AgentDefinition,
  mode: RunMode,
  providers: Provider[],
  index: number,
): RoutedModel {
  const live = providers.filter((p) => p.status === 'connected')
  const pool = live.flatMap((provider) => provider.models.map((model) => ({ provider, model })))

  const configured = pool.find((c) => c.provider.id === agent.providerId && c.model.id === agent.modelId)
  if (mode !== 'local-only' && ['codex', 'claude-code', 'gemini-cli', 'cursor-cli', 'grok'].includes(agent.providerId)) {
    if (!configured) throw new Error(`${agent.name}: ${agent.providerId} is not connected. Connect it in Integrations or explicitly assign another provider in Agents. No paid API fallback was used.`)
    return configured
  }
  const pick = (list: RoutedModel[]) => (list.length ? list[index % Math.min(list.length, 3)] : undefined)

  let choice: RoutedModel | undefined
  switch (mode) {
    case 'local-only':
      choice = pick(pool.filter((c) => c.provider.local))
      // Deliberately no fallback to the agent's default: that is usually a hosted model.
      if (!choice) throw new LocalOnlyError()
      break
    case 'eco':
      choice = pick(pool.filter((c) => !c.provider.local).sort((a, b) => blended(a.model) - blended(b.model)))
      break
    case 'fastest':
      choice = pick(pool.filter((c) => !c.provider.local).sort((a, b) => b.model.tokensPerSecond - a.model.tokensPerSecond))
      break
    case 'max-quality': {
      const frontier = pool.filter((c) => c.model.tier === 'frontier')
      choice = frontier.find((c) => c.provider.id === agent.providerId) ?? pick(frontier)
      break
    }
    default:
      choice = configured
  }

  if (choice) return choice
  if (configured) return configured
  const any = pool[0]
  if (any) return any
  // Nothing connected: fall back to the first declared model so the UI still renders.
  const provider = providers[0]
  return { provider, model: provider.models[0] }
}
