import { FAMILIARS, type FamiliarId } from '@/data/familiars'
import type { ApprovalInfo } from '@/lib/fsBridge'
import type { Run, Worker } from '@/types'

export type FamiliarInteractionKind = 'assignment' | 'handoff' | 'review' | 'outcome' | 'approval'
export interface FamiliarInteraction {
  id: string
  kind: FamiliarInteractionKind
  from: FamiliarId
  to: FamiliarId
  runId: string
  taskId: string
  /** Epoch milliseconds of the evidenced transition, never renderer mount time. */
  at: number
}

const PROVIDER_FAMILIARS = new Map<string, FamiliarId>(FAMILIARS.filter((f) => f.provider).map((f) => [f.provider, f.id]))
// The native ApprovalBook issues exactly 900 seconds of authority. There is no
// createdAt field on its current IPC shape; derive the issue instant from that
// native contract rather than refreshing a cue's timestamp on every render.
const NATIVE_APPROVAL_LIFETIME_MS = 900_000
const finiteOffset = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value >= 0
const outputProduced = (worker: Worker) => Number.isFinite(worker.tokensOut) && worker.tokensOut > 0
function workerEpoch(run: Run, worker: Worker, boundary: 'startedAt' | 'endedAt'): number | null {
  const absolute = boundary === 'startedAt' ? worker.startedAtEpoch : worker.endedAtEpoch
  // An explicit invalid epoch is not repaired with an invented timestamp.
  if (absolute !== undefined) return finiteOffset(absolute) && absolute >= run.startedAt ? absolute : null
  const offset = worker[boundary]
  return finiteOffset(offset) ? run.startedAt + offset : null
}
const actualStarted = (run: Run, worker: Worker) => workerEpoch(run, worker, 'startedAt') !== null
  && (run.status !== 'completed' || worker.status === 'done')
  && (worker.status === 'working' || outputProduced(worker) || Number.isFinite(worker.tokensIn) && worker.tokensIn > 0)
const actualFinished = (run: Run, worker: Worker, successful = false) => {
  const start = workerEpoch(run, worker, 'startedAt'), end = workerEpoch(run, worker, 'endedAt')
  return actualStarted(run, worker) && outputProduced(worker) && (worker.status === 'done' || !successful && worker.status === 'error')
    && start !== null && end !== null && end >= start
}

/**
 * Read-only visual evidence. Consumers baseline IDs on mount/project changes and
 * deduplicate them before showing transient cues; this function does not run or
 * authorize anything. Names, log prose and role labels never substitute for the
 * actual provider identity that executed a worker.
 */
export function deriveFamiliarInteractions(run: Run | null, actualExecution: boolean, replay: boolean,
  pendingApprovals: readonly ApprovalInfo[] = [], nowMs = Date.now()): FamiliarInteraction[] {
  if (!run || !actualExecution || replay || run.source !== 'live' || !Number.isFinite(run.startedAt) || run.startedAt < 0 || !Number.isFinite(nowMs)) return []
  if (run.status === 'stopped' || run.status === 'failed') return []
  const events = new Map<string, FamiliarInteraction>()
  const add = (kind: FamiliarInteractionKind, suffix: string, from: FamiliarId, to: FamiliarId, taskId: string, at: number) => {
    if (!Number.isFinite(at) || at < run.startedAt || at > nowMs) return
    const id = `${run.id}:${kind}:${suffix}`
    events.set(id, { id, kind, from, to, runId: run.id, taskId, at })
  }
  const identity = (worker: Worker) => PROVIDER_FAMILIARS.get(worker.providerId)

  for (const worker of run.workers) {
    const to = identity(worker)
    if (!to || !actualStarted(run, worker)) continue
    const started = workerEpoch(run, worker, 'startedAt')!
    add('assignment', worker.id, 'hq', to, worker.subtaskId ?? run.task.id, started)
    const task = run.subtasks.find((task) => task.id === worker.subtaskId)
    for (const dependency of task?.dependsOn ?? []) {
      const sourceTask = run.subtasks.find((task) => task.id === dependency)
      if (sourceTask?.status !== 'done') continue
      for (const producer of run.workers.filter((source) => source.subtaskId === dependency)) {
        const from = identity(producer)
        if (!from || from === to || !actualFinished(run, producer, true) || workerEpoch(run, producer, 'endedAt')! > started) continue
        add('handoff', `${producer.id}:${worker.id}`, from, to, task!.id, started)
      }
    }
  }

  const artifactProducers = new Set(run.fileChanges.map((file) => file.workerId))
  for (const reviewer of run.workers.filter((worker) => worker.role === 'reviewer')) {
    const to = identity(reviewer)
    if (!to || !actualStarted(run, reviewer)) continue
    const started = workerEpoch(run, reviewer, 'startedAt')!
    for (const producer of run.workers) {
      const from = identity(producer)
      if (!from || from === to || producer.role === 'planner' || producer.role === 'reviewer'
        || !artifactProducers.has(producer.id) || !actualFinished(run, producer) || workerEpoch(run, producer, 'endedAt')! > started) continue
      add('review', `${producer.id}:${reviewer.id}`, from, to, reviewer.subtaskId ?? run.task.id, started)
    }
    if (run.status === 'completed' && ['approved', 'changes_requested'].includes(run.reviewVerdict ?? '') && actualFinished(run, reviewer, true)) {
      add('outcome', `${reviewer.id}:${run.reviewVerdict}`, to, 'hq', run.task.id, workerEpoch(run, reviewer, 'endedAt')!)
    }
  }

  for (const approval of pendingApprovals) {
    if (!approval.id || approval.action !== 'files' || approval.runId !== run.id || approval.projectId !== run.task.projectId
      || approval.taskId !== run.task.id || !['pending', 'desktop_confirmation_required'].includes(approval.status)
      || !Number.isFinite(approval.expiresAt) || approval.expiresAt * 1000 <= nowMs) continue
    // Staging is Zero's action, not an agent request. HQ gets a coordination
    // self-cue; no cross-provider transfer or approval authority is invented.
    add('approval', approval.id, 'hq', 'hq', approval.taskId, approval.expiresAt * 1000 - NATIVE_APPROVAL_LIFETIME_MS)
  }
  return [...events.values()].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
