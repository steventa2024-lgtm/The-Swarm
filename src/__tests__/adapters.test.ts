import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HttpCall } from '@/providers/transport'
import type { Provider } from '@/types'

// Replace the network layer so we can see exactly what each adapter sends and feed it raw bytes back.
const seen: HttpCall[] = []
let listResponse = { status: 200, body: '{"data":[]}' }
let streamChunks: string[] = []
let streamError: Error | null = null

vi.mock('@/providers/transport', () => ({
  request: async (call: HttpCall) => { seen.push(call); return listResponse },
  stream: async (call: HttpCall, onText: (c: string) => void) => {
    seen.push(call)
    if (streamError) throw streamError
    for (const c of streamChunks) onText(c)
  },
  isAbort: () => false,
  inTauri: () => true,
}))

const { openAiAdapter } = await import('@/providers/openai')
const { anthropicAdapter } = await import('@/providers/anthropic')

const openai: Provider = { id: 'openai', name: 'OpenAI', kind: 'openai-compatible', endpoint: 'https://api.openai.com/v1/', local: false, status: 'connected', credentialRef: 'OPENAI_API_KEY', models: [] }
const ollama: Provider = { id: 'ollama', name: 'Ollama', kind: 'ollama', endpoint: 'http://localhost:11434', local: true, status: 'connected', models: [] }
const anthropic: Provider = { id: 'anthropic', name: 'Anthropic', kind: 'anthropic', endpoint: 'https://api.anthropic.com', local: false, status: 'connected', credentialRef: 'ANTHROPIC_API_KEY', models: [] }

const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
const body = (c: HttpCall) => JSON.parse(c.body!)

beforeEach(() => { seen.length = 0; streamChunks = []; streamError = null; listResponse = { status: 200, body: '{"data":[]}' } })

describe('OpenAI-compatible adapter', () => {
  it('lists models with the stored key attached as a Bearer header (by name, never the value)', async () => {
    listResponse = { status: 200, body: JSON.stringify({ data: [{ id: 'gpt-4.1-mini' }, { id: 'gpt-4.1' }] }) }
    const ids = await openAiAdapter.listModels(openai)
    expect(ids).toEqual(['gpt-4.1', 'gpt-4.1-mini']) // sorted
    expect(seen[0].url).toBe('https://api.openai.com/v1/models') // trailing slash handled
    expect(seen[0].auth).toEqual({ env: 'OPENAI_API_KEY', header: 'authorization', prefix: 'Bearer ' })
  })

  it('surfaces a bad key as a readable error with the status code', async () => {
    listResponse = { status: 401, body: '{"error":{"message":"Incorrect API key provided"}}' }
    await expect(openAiAdapter.listModels(openai)).rejects.toThrow(/HTTP 401.*Incorrect API key/)
  })

  it('sends no auth to a local Ollama and adds /v1', async () => {
    await openAiAdapter.listModels(ollama)
    expect(seen[0].url).toBe('http://localhost:11434/v1/models')
    expect(seen[0].auth).toBeUndefined()
  })

  it('builds a streaming chat request that asks for usage and honours JSON mode', async () => {
    streamChunks = [sse({ choices: [{ delta: { content: 'hi' } }] }), 'data: [DONE]\n\n']
    await openAiAdapter.chat(openai, { model: 'gpt-4.1', messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }], maxTokens: 321, json: true })
    const call = seen[0]
    expect(call.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(call.method).toBe('POST')
    expect(body(call)).toMatchObject({ model: 'gpt-4.1', stream: true, stream_options: { include_usage: true }, max_tokens: 321, response_format: { type: 'json_object' } })
    expect(body(call).messages).toHaveLength(2)
  })

  it('does not request JSON mode unless asked', async () => {
    streamChunks = [sse({ choices: [{ delta: { content: 'x' } }] })]
    await openAiAdapter.chat(openai, { model: 'm', messages: [{ role: 'user', content: 'u' }], maxTokens: 10 })
    expect(body(seen[0]).response_format).toBeUndefined()
  })

  it('streams text and reads real usage from the final chunk', async () => {
    const deltas: string[] = []
    streamChunks = [
      sse({ choices: [{ delta: { content: 'Hel' } }] }),
      sse({ choices: [{ delta: { content: 'lo' } }] }),
      sse({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 7 } }),
      'data: [DONE]\n\n',
    ]
    const res = await openAiAdapter.chat(openai, { model: 'm', messages: [{ role: 'user', content: 'u' }], maxTokens: 10, onDelta: (d) => deltas.push(d) })
    expect(res.text).toBe('Hello')
    expect(deltas).toEqual(['Hel', 'lo'])
    expect(res.usage).toEqual({ inputTokens: 120, outputTokens: 7, estimated: false })
  })

  it('reassembles events that arrive split across arbitrary chunk boundaries', async () => {
    const whole = sse({ choices: [{ delta: { content: 'split ' } }] }) + sse({ choices: [{ delta: { content: 'me' } }] })
    streamChunks = [whole.slice(0, 11), whole.slice(11, 40), whole.slice(40)]
    const res = await openAiAdapter.chat(openai, { model: 'm', messages: [{ role: 'user', content: 'u' }], maxTokens: 10 })
    expect(res.text).toBe('split me')
  })

  it('estimates usage (and says so) when the provider reports none — e.g. some local servers', async () => {
    streamChunks = [sse({ choices: [{ delta: { content: 'a'.repeat(40) } }] })]
    const res = await openAiAdapter.chat(ollama, { model: 'm', messages: [{ role: 'user', content: 'x'.repeat(80) }], maxTokens: 10 })
    expect(res.usage.estimated).toBe(true)
    expect(res.usage.outputTokens).toBe(10) // 40 chars / 4
    expect(res.usage.inputTokens).toBe(20) // 80 chars / 4
  })

  it('ignores null deltas, keep-alives and malformed events', async () => {
    streamChunks = [': keep-alive\n\n', 'data: {not json}\n\n', sse({ choices: [{ delta: { content: null } }] }), sse({ choices: [{ delta: { content: 'ok' } }] })]
    const res = await openAiAdapter.chat(openai, { model: 'm', messages: [{ role: 'user', content: 'u' }], maxTokens: 10 })
    expect(res.text).toBe('ok')
  })

  it('throws when the stream reports an error event', async () => {
    streamChunks = [sse({ error: { message: 'The model is overloaded' } })]
    await expect(openAiAdapter.chat(openai, { model: 'm', messages: [{ role: 'user', content: 'u' }], maxTokens: 10 })).rejects.toThrow('overloaded')
  })

  it('propagates transport errors (e.g. HTTP 429) unchanged so callers can retry', async () => {
    streamError = new Error('HTTP 429: {"error":{"message":"Rate limit reached"}}')
    await expect(openAiAdapter.chat(openai, { model: 'm', messages: [{ role: 'user', content: 'u' }], maxTokens: 10 })).rejects.toThrow(/HTTP 429/)
  })
})

describe('Anthropic adapter', () => {
  it('lists models with x-api-key (no prefix) and the version header', async () => {
    listResponse = { status: 200, body: JSON.stringify({ data: [{ id: 'claude-sonnet-5-5' }, { id: 'claude-haiku-4-5' }] }) }
    expect(await anthropicAdapter.listModels(anthropic)).toEqual(['claude-haiku-4-5', 'claude-sonnet-5-5'])
    expect(seen[0].url).toContain('https://api.anthropic.com/v1/models')
    expect(seen[0].auth).toEqual({ env: 'ANTHROPIC_API_KEY', header: 'x-api-key', prefix: '' })
    expect(seen[0].headers).toMatchObject({ 'anthropic-version': '2023-06-01' })
  })

  it('moves system messages into the top-level `system` field and requires max_tokens', async () => {
    streamChunks = [sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'x' } })]
    await anthropicAdapter.chat(anthropic, {
      model: 'claude-sonnet-5-5', maxTokens: 500,
      messages: [{ role: 'system', content: 'be brief' }, { role: 'system', content: 'be kind' }, { role: 'user', content: 'hello' }],
    })
    const b = body(seen[0])
    expect(seen[0].url).toBe('https://api.anthropic.com/v1/messages')
    expect(b.system).toBe('be brief\n\nbe kind')
    expect(b.messages).toEqual([{ role: 'user', content: 'hello' }])
    expect(b).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 500, stream: true })
  })

  it('streams text and combines input tokens (message_start) with output tokens (message_delta)', async () => {
    const deltas: string[] = []
    streamChunks = [
      'event: message_start\n' + sse({ type: 'message_start', message: { usage: { input_tokens: 250, output_tokens: 1 } } }),
      'event: content_block_delta\n' + sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi ' } }),
      'event: content_block_delta\n' + sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'there' } }),
      'event: message_delta\n' + sse({ type: 'message_delta', usage: { output_tokens: 42 } }),
    ]
    const res = await anthropicAdapter.chat(anthropic, { model: 'm', messages: [{ role: 'user', content: 'u' }], maxTokens: 10, onDelta: (d) => deltas.push(d) })
    expect(res.text).toBe('Hi there')
    expect(deltas).toEqual(['Hi ', 'there'])
    expect(res.usage).toEqual({ inputTokens: 250, outputTokens: 42, estimated: false })
  })

  it('ignores non-text deltas (e.g. thinking / input_json)', async () => {
    streamChunks = [sse({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } }), sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } })]
    expect((await anthropicAdapter.chat(anthropic, { model: 'm', messages: [{ role: 'user', content: 'u' }], maxTokens: 10 })).text).toBe('ok')
  })

  it('throws on an error event, such as overloaded_error', async () => {
    streamChunks = [sse({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })]
    await expect(anthropicAdapter.chat(anthropic, { model: 'm', messages: [{ role: 'user', content: 'u' }], maxTokens: 10 })).rejects.toThrow('Overloaded')
  })

  it('surfaces an invalid key from the model list', async () => {
    listResponse = { status: 401, body: '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}' }
    await expect(anthropicAdapter.listModels(anthropic)).rejects.toThrow(/HTTP 401.*invalid x-api-key/)
  })
})
