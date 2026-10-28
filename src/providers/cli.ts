import { inTauri } from './transport'
import { estimateTokens, type ProviderAdapter } from './types'

export const cliAdapter: ProviderAdapter = {
  async listModels(provider, signal) {
    if (!inTauri()) throw new Error('Signed-in CLIs require the desktop app')
    // This performs a real, tools-disabled inference probe; installed is not authenticated.
    await cliAdapter.chat(provider, { model: 'default', messages: [{ role: 'user', content: 'Reply with only READY.' }], maxTokens: 8, signal })
    return ['default']
  },
  async chat(provider, req) {
    if (!inTauri()) throw new Error('Signed-in CLIs require the desktop app')
    if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const { invoke } = await import('@tauri-apps/api/core')
    const requestId = crypto.randomUUID()
    const prompt = req.messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join('\n\n')
    const cancel = () => { void invoke('cli_cancel', { requestId }) }
    req.signal?.addEventListener('abort', cancel, { once: true })
    try {
      const result = await invoke<{ text: string; inputTokens: number | null; outputTokens: number | null }>('cli_chat', { provider: provider.id, requestId, prompt })
      if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      req.onDelta?.(result.text)
      return { text: result.text, usage: { inputTokens: result.inputTokens ?? estimateTokens(prompt), outputTokens: result.outputTokens ?? estimateTokens(result.text), estimated: result.inputTokens === null || result.outputTokens === null } }
    } finally { req.signal?.removeEventListener('abort', cancel) }
  },
}
