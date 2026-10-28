import { describe, expect, it } from 'vitest'
import { seedMemory } from '@/data/seed'
import { relevantNotes } from '@/engine/notes'

const forProject = (id: string) => seedMemory.filter((m) => m.projectId === id)

describe('relevantNotes', () => {
  it('leaves out the Next.js project notes for an unrelated todo-app request', () => {
    const picked = relevantNotes(forProject('proj-zeropulse'), 'Build a small todo web app with localStorage, clean dark UI that works on mobile.')
    expect(picked).toEqual([])
  })
  it('includes a decision note when the request touches it', () => {
    const picked = relevantNotes(forProject('proj-api'), 'Refactor the API layer so all database access goes through a service layer')
    expect(picked.map((m) => m.id)).toContain('mem-3') // "Service layer owns all Prisma access"
  })
  it('includes the flaky-test note for a retry-test request', () => {
    const picked = relevantNotes(forProject('proj-api'), 'Fix the flaky webhook retry tests')
    expect(picked.map((m) => m.id)).toContain('mem-4')
  })
  it('caps how many notes are sent', () => {
    expect(relevantNotes(seedMemory, 'server actions design tokens repository service layer prisma tests flaky docs', 2)).toHaveLength(2)
  })
  it('returns nothing for an empty or all-stopword prompt', () => {
    expect(relevantNotes(seedMemory, '')).toEqual([])
    expect(relevantNotes(seedMemory, 'make it work')).toEqual([])
  })
})

import { useApp } from '@/store/app'

describe('noteUsed', () => {
  it('counts a use for exactly the notes that were sent, and nothing else', () => {
    useApp.setState({ memory: structuredClone(seedMemory) })
    const before = Object.fromEntries(useApp.getState().memory.map((m) => [m.id, m.uses]))
    useApp.getState().noteUsed(['mem-3', 'mem-4'])
    const after = Object.fromEntries(useApp.getState().memory.map((m) => [m.id, m.uses]))
    expect(after['mem-3']).toBe(before['mem-3'] + 1)
    expect(after['mem-4']).toBe(before['mem-4'] + 1)
    expect(after['mem-1']).toBe(before['mem-1'])
  })
  it('ignores unknown ids and an empty list', () => {
    const snapshot = JSON.stringify(useApp.getState().memory)
    useApp.getState().noteUsed([])
    useApp.getState().noteUsed(['does-not-exist'])
    expect(JSON.stringify(useApp.getState().memory)).toBe(snapshot)
  })
})
