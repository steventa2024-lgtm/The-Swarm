/**
 * Project file access. Desktop only — the Rust side (src-tauri/src/fs.rs)
 * enforces that every path stays inside a folder the user approved.
 */
import { inTauri } from '@/providers/transport'

export const fsAvailable = inTauri

export interface ReadResult { exists: boolean; content: string; truncated: boolean; binary: boolean }
export interface WriteOutcome { path: string; ok: boolean; created: boolean; error: string | null }

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  if (!inTauri()) throw new Error('File access needs the desktop app')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

/** Opens the native folder dialog and registers the choice as approved. */
export const pickFolder = () => invoke<string | null>('pick_project_folder', {})
export const isRootApproved = (root: string) => invoke<boolean>('is_root_approved', { root })
export const listTree = (root: string, maxEntries = 200) => invoke<string[]>('fs_list_tree', { root, maxEntries })
export const readText = (root: string, path: string, maxBytes = 8000) => invoke<ReadResult>('fs_read_text', { root, path, maxBytes })
export const applyFiles = (root: string, files: { path: string; content: string }[]) => invoke<WriteOutcome[]>('fs_apply', { root, files })

/**
 * Normalises a model-proposed path to a project-relative one, or returns null
 * if it could not be safe. The Rust side re-validates; this keeps bad paths out of the UI.
 */
export function cleanPath(raw: string): string | null {
  const p = raw.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '')
  if (!p || p.length > 240 || p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.includes(':') || p.includes('\0')) return null
  const parts = p.split('/').filter(Boolean)
  if (parts.some((s) => s === '..' || s === '.' || s.toLowerCase() === '.git' || /[. ]$/.test(s))) return null
  return parts.join('/')
}
