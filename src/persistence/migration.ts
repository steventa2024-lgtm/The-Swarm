import type { StateStorage } from 'zustand/middleware'

/** Read old preferences once, but never overwrite the older application's state. */
export function withLegacyFallback(storage: StateStorage, legacyKey: string): StateStorage {
  return {
    getItem: async (name) => (await storage.getItem(name)) ?? storage.getItem(legacyKey),
    setItem: (name, value) => storage.setItem(name, value),
    removeItem: (name) => storage.removeItem(name),
  }
}
