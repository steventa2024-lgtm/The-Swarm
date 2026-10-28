import { describe, expect, it } from 'vitest'
import { MAX_FILE_CHARS, looksBinary, readAttachment, renderAttachments } from '@/lib/attachments'
import type { Attachment } from '@/types'

const file = (name: string, text: string, size = text.length) => ({ name, size, text: async () => text })
const att = (name: string, content: string, truncated = false): Attachment => ({ name, content, truncated, tokens: Math.ceil(content.length / 4), secrets: 0 })

describe('readAttachment', () => {
  it('reads a text file and estimates its token cost', async () => {
    const r = await readAttachment(file('notes.md', 'x'.repeat(400)))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.attachment).toMatchObject({ name: 'notes.md', truncated: false, tokens: 100, secrets: 0 })
    }
  })

  it('cuts very long files and flags them as truncated', async () => {
    const r = await readAttachment(file('big.txt', 'a'.repeat(MAX_FILE_CHARS + 5000)))
    expect(r.ok && r.attachment.content.length).toBe(MAX_FILE_CHARS)
    expect(r.ok && r.attachment.truncated).toBe(true)
  })

  it('refuses binary content and oversized files with a readable reason', async () => {
    const bin = await readAttachment(file('image.png', 'PNG\0\0\0data'))
    expect(bin).toEqual({ ok: false, reason: expect.stringContaining("isn't a text file") })
    const huge = await readAttachment(file('video.txt', 'x', 50_000_000))
    expect(huge).toEqual({ ok: false, reason: expect.stringContaining('too large') })
  })

  it('warns when the file contains something that looks like a secret, without altering the content', async () => {
    const key = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789'
    const r = await readAttachment(file('.env.example', `OPENAI_API_KEY=${key}\nPORT=3000`))
    expect(r.ok && r.attachment.secrets).toBe(1)
    expect(r.ok && r.attachment.content).toContain(key) // the user's choice; we only warn
  })

  it('reports an unreadable file instead of throwing', async () => {
    const r = await readAttachment({ name: 'x.txt', size: 1, text: async () => { throw new Error('nope') } })
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('could not be read') })
  })
})

describe('looksBinary', () => {
  it('is false for ordinary text, including non-English', () => {
    expect(looksBinary('const a = 1\nconsole.log("héllo wörld — 日本語")')).toBe(false)
  })
  it('is true for NUL bytes or mostly replacement characters', () => {
    expect(looksBinary('ab\0cd')).toBe(true)
    expect(looksBinary('�'.repeat(100) + 'abc')).toBe(true)
  })
})

describe('renderAttachments', () => {
  it('returns nothing when there are no attachments', () => expect(renderAttachments([])).toBe(''))

  it('labels each file and tells the planner the workers will not see them', () => {
    const t = renderAttachments([att('spec.md', 'Build X'), att('api.json', '{"a":1}')])
    expect(t).toContain('workers will NOT see these')
    expect(t).toContain('--- spec.md ---\nBuild X')
    expect(t).toContain('--- api.json ---\n{"a":1}')
  })

  it('stays within the character budget and says what was cut or left out', () => {
    const t = renderAttachments([att('a.txt', 'A'.repeat(100)), att('b.txt', 'B'.repeat(100)), att('c.txt', 'C'.repeat(100))], 150)
    expect(t).toContain('--- a.txt ---')
    expect(t).toContain('b.txt (truncated)')
    expect(t).toContain('c.txt (omitted')
    expect((t.match(/[ABC]/g) ?? []).length).toBeLessThanOrEqual(150 + 6) // + letters in the filenames
  })

  it('keeps a file\'s own truncated marker', () => {
    expect(renderAttachments([att('log.txt', 'x', true)])).toContain('log.txt (truncated)')
  })
})

describe('attachments in the store', () => {
  it('caps the list, replaces a file re-attached under the same name, and clears after a run starts', async () => {
    ;(globalThis as unknown as { window: unknown }).window = globalThis
    const { useSwarm } = await import('@/store/swarm')
    const { useApp } = await import('@/store/app')
    useApp.setState({ preferences: { ...useApp.getState().preferences, orchestrator: 'simulated' } })
    const { MAX_ATTACHMENTS } = await import('@/lib/attachments')

    for (let i = 0; i < MAX_ATTACHMENTS + 3; i++) useSwarm.getState().addAttachment(att(`f${i}.txt`, 'x'))
    expect(useSwarm.getState().attachments).toHaveLength(MAX_ATTACHMENTS)
    expect(useSwarm.getState().attachments.at(-1)!.name).toBe(`f${MAX_ATTACHMENTS + 2}.txt`) // newest kept

    useSwarm.getState().addAttachment(att('f7.txt', 'newer content'))
    expect(useSwarm.getState().attachments.filter((a) => a.name === 'f7.txt')).toHaveLength(1)
    expect(useSwarm.getState().attachments.find((a) => a.name === 'f7.txt')!.content).toBe('newer content')

    useSwarm.getState().removeAttachment('f7.txt')
    expect(useSwarm.getState().attachments.some((a) => a.name === 'f7.txt')).toBe(false)

    useSwarm.getState().start({ prompt: 'Build a thing', record: false })
    expect(useSwarm.getState().attachments).toEqual([]) // per-run: never re-sent by accident
    useSwarm.getState().reset()
  })
})
