/**
 * Network layer for provider calls.
 *  - Desktop (Tauri): goes through the Rust bridge, which reads API keys from
 *    environment variables so secrets never enter the webview.
 *  - Browser (dev): plain fetch. Works for local, key-less endpoints only.
 */

export interface HttpCall {
  url: string
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  /** Secret is read from this env var by the Rust side and sent as `header: prefix + secret`. */
  auth?: { env: string; header: string; prefix: string }
}

export const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

let counter = 0
const nextId = () => `req_${Date.now().toString(36)}_${(counter++).toString(36)}`

const abortError = () => new DOMException('Aborted', 'AbortError')

function browserInit(call: HttpCall, signal?: AbortSignal): RequestInit {
  if (call.auth) {
    throw new Error('API keys are stored by the desktop app. Open ZeroPulse Swarm from your desktop (not the browser preview) to use your key.')
  }
  return {
    method: call.method ?? 'GET',
    headers: { ...(call.body ? { 'content-type': 'application/json' } : {}), ...call.headers },
    body: call.body,
    signal,
  }
}

export async function request(call: HttpCall, signal?: AbortSignal): Promise<{ status: number; body: string }> {
  if (signal?.aborted) throw abortError()
  if (inTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('provider_request', {
      req: { id: nextId(), url: call.url, method: call.method ?? 'GET', headers: call.headers ?? {}, auth: call.auth, body: call.body },
    })
  }
  const res = await fetch(call.url, browserInit(call, signal))
  return { status: res.status, body: await res.text() }
}

/** Streams the response body as text chunks. Rejects on HTTP errors with a readable message. */
export async function stream(call: HttpCall, onText: (chunk: string) => void, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError()

  if (inTauri()) {
    const { invoke, Channel } = await import('@tauri-apps/api/core')
    const id = nextId()
    const channel = new Channel<string>()
    channel.onmessage = onText
    const onAbort = () => { void invoke('provider_cancel', { id }) }
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      await invoke('provider_stream', {
        req: { id, url: call.url, method: call.method ?? 'POST', headers: call.headers ?? {}, auth: call.auth, body: call.body },
        onChunk: channel,
      })
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
    if (signal?.aborted) throw abortError()
    return
  }

  const res = await fetch(call.url, browserInit({ ...call, method: call.method ?? 'POST' }, signal))
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 600)}`)
  if (!res.body) throw new Error('Response had no body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    onText(decoder.decode(value, { stream: true }))
  }
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'
