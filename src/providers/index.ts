import type { ModelInfo, Provider } from '@/types'
import { anthropicAdapter } from './anthropic'
import { openAiAdapter } from './openai'
import type { ProviderAdapter } from './types'

export * from './types'
export { isAbort, inTauri } from './transport'

export function adapterFor(p: Provider): ProviderAdapter {
  return p.kind === 'anthropic' ? anthropicAdapter : openAiAdapter
}

export interface ConnectionResult {
  ok: boolean
  latencyMs: number
  modelIds: string[]
  error?: string
  /** Configured models the endpoint did not report (cloud providers). */
  missing: string[]
  /** Cloud-hosted models filtered out of a local provider. */
  hiddenCloud?: number
  /** Provider with refreshed model list, ready to store when ok. */
  next?: Partial<Provider>
}

function localModel(id: string): ModelInfo {
  return { id, label: id, tier: 'local', contextWindow: 32_000, inputCostPer1M: 0, outputCostPer1M: 0, tokensPerSecond: 40 }
}

/**
 * Checks reachability and credentials by listing models.
 * Local providers get their model list replaced by what is actually installed;
 * hosted providers keep their curated list (with prices) and report any
 * configured models the endpoint does not know.
 */
export async function testConnection(p: Provider): Promise<ConnectionResult> {
  const started = performance.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const ids = await adapterFor(p).listModels(p, ctrl.signal)
    const latencyMs = Math.round(performance.now() - started)
    if (p.local) {
      // Ollama can list cloud-hosted models ("…-cloud"). They leave this machine, so they never count as local.
      const onDevice = ids.filter((id) => !/[-:]cloud$/.test(id))
      const hidden = ids.length - onDevice.length
      if (onDevice.length === 0) {
        return { ok: false, latencyMs, modelIds: [], missing: [], error: 'Connected, but the server reports no models. Pull or load one first.' }
      }
      return { ok: true, latencyMs, modelIds: onDevice, missing: [], hiddenCloud: hidden, next: { models: onDevice.map(localModel), verified: true, status: 'connected' } }
    }
    const missing = p.models.map((m) => m.id).filter((id) => !ids.some((x) => x === id || x.startsWith(id)))
    return { ok: true, latencyMs, modelIds: ids, missing, next: { verified: true, status: 'connected' } }
  } catch (e) {
    const aborted = ctrl.signal.aborted
    const raw = aborted ? 'Timed out after 15 s' : e instanceof Error ? e.message : String(e)
    return { ok: false, latencyMs: Math.round(performance.now() - started), modelIds: [], missing: [], error: raw }
  } finally {
    clearTimeout(timer)
  }
}
