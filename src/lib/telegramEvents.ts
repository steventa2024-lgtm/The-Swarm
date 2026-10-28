import type { Run } from '@/types'

export type TelegramEventKind = 'task_started' | 'agent_assigned' | 'task_finished' | 'task_failed' | 'project_attention' | 'workflow_finished' | 'critical_alert'
export interface TelegramOperationalEvent {
  id: string
  kind: TelegramEventKind
  projectId: string
  taskId: string
  runId: string
  agentId: string
  status: string
}

/** Only fixed states and opaque references cross this boundary. Never model prose or source. */
export function operationalEvents(run: Run): TelegramOperationalEvent[] {
  if (run.source !== 'live') return []
  const events: TelegramOperationalEvent[] = []
  const add = (kind: TelegramEventKind, suffix: string, agentId = 'hq', taskId = run.task.id, status = run.status) => {
    events.push({ id: `${run.id}_${suffix}`, kind, projectId: run.task.projectId, taskId, runId: run.id, agentId, status })
  }
  add('task_started', 'started', 'hq', run.task.id, 'running')
  for (const worker of run.workers.slice(1, -1)) {
    if (!worker.subtaskId) continue
    if (worker.status === 'working' || worker.tokensIn + worker.tokensOut > 0) add('agent_assigned', `${worker.id}_assigned`, worker.providerId, worker.subtaskId, 'running')
    if (worker.status === 'done' && worker.tokensOut > 0) add('task_finished', `${worker.id}_finished`, worker.providerId, worker.subtaskId, 'completed')
    if (worker.status === 'error') add('task_failed', `${worker.id}_failed`, worker.providerId, worker.subtaskId, 'failed')
  }
  if (run.status === 'completed') {
    add('workflow_finished', 'finished')
    if (run.reviewVerdict !== 'approved') add('project_attention', 'attention')
  } else if (run.status === 'failed') {
    add('task_failed', 'failed')
    add('critical_alert', 'critical')
  }
  return events
}
