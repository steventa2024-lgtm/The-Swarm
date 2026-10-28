import type { ProviderAdapter } from './types'
import { inTauri } from './transport'
import { estimateTokens } from './types'
export const deepseekAdapter: ProviderAdapter = {
  async listModels() {
    if (!inTauri()) throw new Error('DeepSeek requires the native secure adapter')
    const { invoke } = await import('@tauri-apps/api/core')
    return (await invoke<{ models: string[] }>('deepseek_test')).models
  },
  async chat(_provider, req) {
    if (!inTauri() || !req.projectId) throw new Error('Native DeepSeek project scope required')
    if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const { invoke, Channel } = await import('@tauri-apps/api/core')
    const onChunk = new Channel<string>(); onChunk.onmessage = (text) => { if (!req.signal?.aborted) req.onDelta?.(text) }
    const cancel = () => { void invoke('deepseek_cancel') }; req.signal?.addEventListener('abort', cancel, { once: true })
    try {
    const r = await invoke<{ text: string; observedModel?: string; usage: { prompt_tokens?: number; completion_tokens?: number } }>('deepseek_chat', { projectId: req.projectId, model: req.model, messages: req.messages, maxTokens: Math.min(req.maxTokens, 4096), onChunk })
    if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return { text: r.text, observedModel: r.observedModel, usage: { inputTokens: r.usage?.prompt_tokens ?? estimateTokens(req.messages.map((m) => m.content).join('')), outputTokens: r.usage?.completion_tokens ?? estimateTokens(r.text), estimated: r.usage?.prompt_tokens === undefined || r.usage?.completion_tokens === undefined } }
    } finally { req.signal?.removeEventListener('abort', cancel) }
  },
}
