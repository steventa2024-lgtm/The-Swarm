import type { Subtask } from '@/types'

/** Validate the whole DAG before launching any work. */
export function validateDependencies(tasks: Subtask[]): void {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  if (byId.size !== tasks.length) throw new Error('Duplicate task IDs')
  const visiting = new Set<string>(), done = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error('Task dependency cycle')
    if (done.has(id)) return
    const task = byId.get(id)
    if (!task) throw new Error(`Unknown dependency: ${id}`)
    visiting.add(id)
    task.dependsOn.forEach(visit)
    visiting.delete(id); done.add(id)
  }
  tasks.forEach((t) => visit(t.id))
}

/** Work-conserving scheduler; failed dependencies never execute downstream work. */
export async function scheduleTasks(tasks: Subtask[], concurrency: number,
  execute: (task: Subtask) => Promise<void>, gate: () => Promise<void>, signal: AbortSignal,
  onBlocked: (task: Subtask) => void = () => {},
): Promise<void> {
  validateDependencies(tasks)
  const limit = Math.max(1, Math.min(8, Math.floor(concurrency) || 1))
  const remaining = new Set(tasks.map((t) => t.id))
  const active = new Map<string, Promise<void>>()
  let failure: unknown
  while (remaining.size || active.size) {
    await gate()
    if (signal.aborted) { await Promise.allSettled(active.values()); throw new DOMException('Aborted', 'AbortError') }
    for (const task of tasks) {
      if (!remaining.has(task.id) || active.size >= limit) continue
      const deps = tasks.filter((t) => task.dependsOn.includes(t.id))
      if (deps.some((d) => d.status === 'blocked')) {
        task.status = 'blocked'; remaining.delete(task.id); onBlocked(task); continue
      }
      if (!deps.every((d) => d.status === 'done')) continue
      remaining.delete(task.id)
      const job = Promise.resolve().then(() => execute(task)).catch((e) => {
        task.status = 'blocked'; failure ??= e
      }).finally(() => active.delete(task.id))
      active.set(task.id, job)
    }
    if (active.size) await Promise.race(active.values())
    else if (remaining.size && !tasks.some((t) => remaining.has(t.id) && t.dependsOn.some((id) => tasks.find((d) => d.id === id)?.status === 'blocked'))) {
      throw new Error('No runnable task remains')
    }
  }
  if (failure) throw failure
}
