import type { Provider } from '@/types'
import { createSseParser } from './sse'
import { request, stream, type HttpCall } from './transport'
import { estimateTokens, type ChatRequest, type ChatResult, type ProviderAdapter } from './types'

/**
 * Speaks the OpenAI chat-completions protocol. Covers OpenAI, OpenRouter,
 * llama.cpp's server, and Ollama (via its /v1 compatibility endpoint).
 */

function baseUrl(p: Provider): string {
  const base = p.endpoint.replace(/\/+$/, '')
  return p.kind === 'ollama' && !/\/v1$/.test(base) ? `${base}/v1` : base
}

function authFor(p: Provider): HttpCall['auth'] {
  return !p.local && p.credentialRef ? { env: p.credentialRef, header: 'authorization', prefix: 'Bearer ' } : undefined
}

export const openAiAdapter: ProviderAdapter = {
  async listModels(p, signal) {
    const res = await request({ url: `${baseUrl(p)}/models`, auth: authFor(p) }, signal)
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}: ${res.body.slice(0, 300)}`)
    const json = JSON.parse(res.body) as { data?: { id: string }[]; models?: { name: string }[] }
    const ids = json.data?.map((m) => m.id) ?? json.models?.map((m) => m.name) ?? []
    return ids.sort()
  },

  async chat(p, req: ChatRequest): Promise<ChatResult> {
    const body = JSON.stringify({
      model: req.model,
      messages: req.messages,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: req.maxTokens,
      temperature: req.temperature ?? 0.2,
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    })

    let text = ''
    // Mutated from the SSE callback, so held in an object to keep TypeScript from narrowing it away.
    const got: { usage: { inputTokens: number; outputTokens: number } | null; error: string | null } = { usage: null, error: null }

    const parser = createSseParser((data) => {
      if (data.trim() === '[DONE]') return
      let evt: {
        choices?: { delta?: { content?: string | null } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number } | null
        error?: { message?: string }
      }
      try { evt = JSON.parse(data) } catch { return }
      if (evt.error) got.error = evt.error.message ?? 'Provider reported an error'
      const delta = evt.choices?.[0]?.delta?.content
      if (delta) {
        text += delta
        req.onDelta?.(delta)
      }
      if (evt.usage) got.usage = { inputTokens: evt.usage.prompt_tokens ?? 0, outputTokens: evt.usage.completion_tokens ?? 0 }
    })

    await stream(
      { url: `${baseUrl(p)}/chat/completions`, method: 'POST', body, auth: authFor(p) },
      (chunk) => parser.push(chunk),
      req.signal,
    )
    parser.end()
    if (got.error) throw new Error(got.error)

    const promptChars = req.messages.reduce((n, m) => n + m.content.length, 0)
    return {
      text,
      usage: got.usage
        ? { ...got.usage, estimated: false }
        : { inputTokens: Math.ceil(promptChars / 4), outputTokens: estimateTokens(text), estimated: true },
    }
  },
}
