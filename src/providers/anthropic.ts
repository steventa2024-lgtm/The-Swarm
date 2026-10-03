import type { Provider } from '@/types'
import { createSseParser } from './sse'
import { request, stream, type HttpCall } from './transport'
import { estimateTokens, type ChatRequest, type ChatResult, type ProviderAdapter } from './types'

/** Anthropic Messages API (also works with Anthropic-compatible gateways). */

const VERSION = '2023-06-01'
const base = (p: Provider) => p.endpoint.replace(/\/+$/, '')
const auth = (p: Provider): HttpCall['auth'] =>
  p.credentialRef ? { env: p.credentialRef, header: 'x-api-key', prefix: '' } : undefined

export const anthropicAdapter: ProviderAdapter = {
  async listModels(p, signal) {
    const res = await request(
      { url: `${base(p)}/v1/models?limit=100`, headers: { 'anthropic-version': VERSION }, auth: auth(p) },
      signal,
    )
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}: ${res.body.slice(0, 300)}`)
    return (JSON.parse(res.body) as { data?: { id: string }[] }).data?.map((m) => m.id).sort() ?? []
  },

  async chat(p, req: ChatRequest): Promise<ChatResult> {
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
    const messages = req.messages.filter((m) => m.role !== 'system')
    const body = JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature ?? 0.2,
      stream: true,
      ...(system ? { system } : {}),
      messages,
    })

    let text = ''
    const got = { inputTokens: 0, outputTokens: 0, sawUsage: false, error: null as string | null }

    const parser = createSseParser((data) => {
      let evt: {
        type?: string
        message?: { usage?: { input_tokens?: number; output_tokens?: number } }
        delta?: { type?: string; text?: string }
        usage?: { output_tokens?: number; input_tokens?: number }
        error?: { message?: string }
      }
      try { evt = JSON.parse(data) } catch { return }
      switch (evt.type) {
        case 'message_start':
          got.inputTokens = evt.message?.usage?.input_tokens ?? 0
          got.outputTokens = evt.message?.usage?.output_tokens ?? 0
          got.sawUsage = true
          break
        case 'content_block_delta':
          if (evt.delta?.type === 'text_delta' && evt.delta.text) {
            text += evt.delta.text
            req.onDelta?.(evt.delta.text)
          }
          break
        case 'message_delta':
          if (evt.usage?.output_tokens != null) got.outputTokens = evt.usage.output_tokens
          if (evt.usage?.input_tokens != null) got.inputTokens = evt.usage.input_tokens
          break
        case 'error':
          got.error = evt.error?.message ?? 'Provider reported an error'
          break
      }
    })

    await stream(
      { url: `${base(p)}/v1/messages`, method: 'POST', headers: { 'anthropic-version': VERSION }, body, auth: auth(p) },
      (chunk) => parser.push(chunk),
      req.signal,
    )
    parser.end()
    if (got.error) throw new Error(got.error)

    return {
      text,
      usage: got.sawUsage
        ? { inputTokens: got.inputTokens, outputTokens: got.outputTokens, estimated: false }
        : { inputTokens: Math.ceil(req.messages.reduce((n, m) => n + m.content.length, 0) / 4), outputTokens: estimateTokens(text), estimated: true },
    }
  },
}
