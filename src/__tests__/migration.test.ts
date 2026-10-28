import { expect, it } from 'vitest'
import { withLegacyFallback } from '@/persistence/migration'

it('imports existing projects without overwriting state used by the original application', async () => {
  const legacy = JSON.stringify({ projects: [{ id: 'real-project', root: 'C:/work' }] })
  const memory = new Map([['v1', legacy]])
  const storage = withLegacyFallback({
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => { memory.set(key, value) },
    removeItem: (key) => { memory.delete(key) },
  }, 'v1')
  expect(await storage.getItem('v2')).toBe(legacy)
  await storage.setItem('v2', 'upgraded')
  expect(await storage.getItem('v2')).toBe('upgraded')
  expect(memory.get('v1')).toBe(legacy)
  await storage.removeItem('v2')
  expect(memory.get('v1')).toBe(legacy)
})
