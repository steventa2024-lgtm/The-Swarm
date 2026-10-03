import type { AgentDefinition, ModelInfo, Provider, RunMode } from '@/types'

export interface RoutedModel {
  provider: Provider
  model: ModelInfo
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
  const pick = (list: RoutedModel[]) => (list.length ? list[index % Math.min(list.length, 3)] : undefined)

  let choice: RoutedModel | undefined
  switch (mode) {
    case 'local-only':
      choice = pick(pool.filter((c) => c.provider.local))
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
