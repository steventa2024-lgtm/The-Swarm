import { describe, expect, it } from 'vitest'
import { buildFixPrompt, formatDurationMs } from '@/lib/checks'

describe('buildFixPrompt', () => {
  it('includes the failing check, its output and the original task', () => {
    const p = buildFixPrompt({ label: 'npm run test', output: 'FAIL src/a.test.ts\nexpected 2 got 3', originalTask: 'Add a counter' })
    expect(p).toContain('`npm run test`')
    expect(p).toContain('expected 2 got 3')
    expect(p).toContain('original task was: Add a counter')
    expect(p).toMatch(/Change only what is needed/)
  })
  it('strips ANSI colour codes and carriage returns', () => {
    const p = buildFixPrompt({ label: 'x', output: '\u001b[31mred error\u001b[0m\r\nline2' })
    expect(p).toContain('red error')
    expect(p).not.toMatch(/\u001b|\r/)
  })
  it('keeps the END of a long log, where failures usually are', () => {
    const log = 'start\n' + 'noise\n'.repeat(2000) + 'THE REAL FAILURE'
    const p = buildFixPrompt({ label: 'x', output: log })
    expect(p).toContain('THE REAL FAILURE')
    expect(p).not.toContain('start\n')
    expect(p.length).toBeLessThan(4500)
  })
  it('says so when there is no output and when the check timed out', () => {
    expect(buildFixPrompt({ label: 'x', output: '   ' })).toContain('(no output)')
    expect(buildFixPrompt({ label: 'x', output: 'z', timedOut: true })).toMatch(/timed out/)
  })
  it('omits the context line when there is no original task', () => {
    expect(buildFixPrompt({ label: 'x', output: 'z' })).not.toContain('original task')
  })
})

describe('formatDurationMs', () => {
  it('formats short and long runs', () => {
    expect(formatDurationMs(420)).toBe('420 ms')
    expect(formatDurationMs(2400)).toBe('2.4 s')
    expect(formatDurationMs(48_000)).toBe('48 s')
  })
})
