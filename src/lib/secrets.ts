/**
 * API keys are stored by the desktop app in the OS credential store
 * (Windows Credential Manager). The webview can save, check and remove a key,
 * but can never read one back.
 */
import { inTauri } from '@/providers/transport'

export type KeySource = 'keychain' | 'env' | 'none'

export const secretsAvailable = inTauri

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  if (!inTauri()) throw new Error('Keys are managed by the desktop app. Open ZeroPulse Swarm from your desktop.')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export const keyStatus = (name: string) => invoke<{ source: KeySource }>('secret_status', { name }).then((r) => r.source)
export const saveKey = (name: string, value: string) => invoke<void>('secret_set', { name, value })
export const removeKey = (name: string) => invoke<void>('secret_delete', { name })
