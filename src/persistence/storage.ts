import type { StateStorage } from 'zustand/middleware'

/**
 * Persistence adapter for zustand's `persist`.
 *  - Inside Tauri: rows in a SQLite `kv_store` table (see src-tauri/migrations).
 *  - In a plain browser (dev / preview): localStorage.
 * If SQLite fails for any reason we fall back to localStorage rather than lose state.
 */

const DB_URL = 'sqlite:zeropulse.db'

interface SqlDb {
  select<T>(query: string, bindings?: unknown[]): Promise<T>
  execute(query: string, bindings?: unknown[]): Promise<unknown>
}

const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

let dbPromise: Promise<SqlDb | null> | null = null

function getDb(): Promise<SqlDb | null> {
  if (!inTauri()) return Promise.resolve(null)
  dbPromise ??= import('@tauri-apps/plugin-sql')
    .then((m) => m.default.load(DB_URL) as Promise<SqlDb>)
    .catch((err) => {
      console.warn('[persistence] SQLite unavailable, using localStorage', err)
      return null
    })
  return dbPromise
}

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* quota / private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k) } catch { /* noop */ } },
}

export const appStorage: StateStorage = {
  async getItem(name) {
    const db = await getDb()
    if (!db) return ls.get(name)
    try {
      const rows = await db.select<{ value: string }[]>('SELECT value FROM kv_store WHERE key = $1', [name])
      return rows[0]?.value ?? null
    } catch {
      return ls.get(name)
    }
  },
  async setItem(name, value) {
    const db = await getDb()
    if (!db) return ls.set(name, value)
    try {
      await db.execute(
        'INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2, unixepoch()) ' +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        [name, value],
      )
    } catch {
      ls.set(name, value)
    }
  },
  async removeItem(name) {
    const db = await getDb()
    if (!db) return ls.del(name)
    try {
      await db.execute('DELETE FROM kv_store WHERE key = $1', [name])
    } catch {
      ls.del(name)
    }
  },
}
