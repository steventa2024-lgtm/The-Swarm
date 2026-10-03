import type { Provider } from '@/types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  maxTokens: number
  temperature?: number
  /** Ask the provider for a JSON object where it supports that natively. */
  json?: boolean
  signal?: AbortSignal
  /** Called with each streamed piece of generated text. */
  onDelta?: (text: string) => void
}

export interface Usage {
  inputTokens: number
  outputTokens: number
  /** True when the provider reported no usage and we estimated from text length. */
  estimated: boolean
}

export interface ChatResult {
  text: string
  usage: Usage
}

export interface ProviderAdapter {
  /** Model ids the endpoint reports. Also serves as the connection test. */
  listModels(provider: Provider, signal?: AbortSignal): Promise<string[]>
  chat(provider: Provider, req: ChatRequest): Promise<ChatResult>
}

export const estimateTokens = (text: string) => Math.ceil(text.length / 4)
