import { describe, expect, it } from 'vitest'
import { scheduleTasks, validateDependencies } from '@/engine/scheduler'
import type { Subtask } from '@/types'
const task = (id: string, dependsOn: string[] = []): Subtask => ({ id, dependsOn, role: 'backend', title: id, description: '', status: 'pending' })
describe('dependency orchestrator', () => {
  it('rejects cycles, missing dependencies and duplicate IDs before work', () => {
    expect(() => validateDependencies([task('a',['b']),task('b',['a'])])).toThrow(/cycle/)
    expect(() => validateDependencies([task('a',['missing'])])).toThrow(/Unknown/)
    expect(() => validateDependencies([task('a'),task('a')])).toThrow(/Duplicate/)
  })
  it('runs independent work concurrently, respects the cap and awaits prerequisites', async () => {
    const tasks = [task('a'), task('b'), task('c',['a','b']), task('d')]
    let active = 0, peak = 0; const done: string[] = []
    await scheduleTasks(tasks, 2, async (t) => { for (const d of t.dependsOn) expect(done).toContain(d); active++; peak = Math.max(peak, active); t.status = 'active'; await new Promise((r)=>setTimeout(r,10)); t.status = 'done'; done.push(t.id); active-- }, async () => {}, new AbortController().signal)
    expect(peak).toBe(2); expect(done).toHaveLength(4)
  })
  it('blocks descendants of failed work while finishing independent work', async () => {
    const tasks = [task('a'), task('b',['a']), task('c')]; const ran: string[] = []
    await scheduleTasks(tasks, 2, async (t) => { ran.push(t.id); t.status = t.id === 'a' ? 'blocked' : 'done' }, async () => {}, new AbortController().signal)
    expect(ran).toEqual(['a','c']); expect(tasks[1].status).toBe('blocked')
  })
  it('never launches queued work after stop', async () => {
    const abort = new AbortController(), ran: string[] = []
    await expect(scheduleTasks([task('a'),task('b')], 1, async (t) => { ran.push(t.id); t.status='done'; abort.abort() }, async () => {}, abort.signal)).rejects.toThrow(/Aborted/)
    expect(ran).toEqual(['a'])
  })
})
