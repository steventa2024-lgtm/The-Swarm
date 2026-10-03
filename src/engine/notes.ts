import type { ProjectMemory } from '@/types'

const STOP = new Set([
  'with', 'that', 'this', 'from', 'should', 'would', 'could', 'into', 'have', 'will', 'your', 'their', 'there', 'which',
  'make', 'create', 'build', 'small', 'simple', 'using', 'used', 'also', 'when', 'then', 'than', 'each', 'every', 'only',
  'just', 'like', 'need', 'needs', 'want', 'wants', 'add', 'new', 'clean', 'work', 'works', 'user', 'users',
])

const words = (s: string) => (s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter((w) => !STOP.has(w))

/**
 * Picks the project notes that actually relate to the request (shared meaningful words).
 * Unrelated notes steer the plan the wrong way and cost tokens, so they are left out.
 */
export function relevantNotes(memory: ProjectMemory[], prompt: string, max = 4): ProjectMemory[] {
  const wanted = new Set(words(prompt))
  if (wanted.size === 0) return []
  return memory
    .map((m) => {
      const own = new Set(words(`${m.title} ${m.body} ${m.tags.join(' ')}`))
      let score = 0
      for (const w of wanted) if (own.has(w)) score++
      return { m, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.m)
}
