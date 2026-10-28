import type { Provider, Run } from '@/types'
import type { ApprovalInfo } from '@/lib/fsBridge'
export const FAMILIARS = [
  { id: 'hq', provider: '', name: 'Swarm HQ', role: 'Operations & owner approvals', animal: 'Crowned bee', color: '#F5BB52' },
  { id: 'codex', provider: 'codex', name: 'Codex', role: 'Chief Engineer / Project Lead', animal: 'Crystalline wolf', color: '#42CCFF' },
  { id: 'claude', provider: 'claude-code', name: 'Claude', role: 'Principal Software Engineer', animal: 'Ember phoenix', color: '#FF873D' },
  { id: 'gemini', provider: 'gemini-cli', name: 'Gemini', role: 'Frontend / UI Engineer', animal: 'Violet-blue fox', color: '#8181FF' },
  { id: 'cursor', provider: 'cursor-cli', name: 'Cursor', role: 'QA & Integration Engineer', animal: 'Amethyst cyber-cat', color: '#C16BFF' },
  { id: 'grok', provider: 'grok', name: 'Grok', role: 'Research Specialist', animal: 'Mint technofox', color: '#54E8BA' },
  { id: 'deepseek', provider: 'deepseek', name: 'DeepSeek', role: 'Architecture Auditor', animal: 'Bioluminescent whale', color: '#1CBFFF' },
  { id: 'ollama', provider: 'ollama', name: 'Ollama', role: 'Local / Offline Support', animal: 'Crystal llama', color: '#97EA89' },
] as const
export type FamiliarId = typeof FAMILIARS[number]['id']
export type MascotState = 'idle' | 'thinking' | 'working' | 'reviewing' | 'waiting_approval' | 'completed' | 'failed' | 'offline'
export const MASCOT_STATES: MascotState[] = ['idle', 'thinking', 'working', 'reviewing', 'waiting_approval', 'completed', 'failed', 'offline']
/** Native pending metadata is evidence of a revision, never authority to decide it. */
export function hasFamiliarApproval(run: Run | null, approvals: readonly ApprovalInfo[], nowMs: number): boolean {
  if (!run || run.source !== 'live') return false
  return approvals.some((approval) => approval.id.length > 0 && approval.action === 'files'
    && approval.runId === run.id && approval.projectId === run.task.projectId && approval.taskId === run.task.id
    && ['pending', 'desktop_confirmation_required'].includes(approval.status)
    && Number.isFinite(approval.expiresAt) && approval.expiresAt * 1000 > nowMs)
}

/** A saved live-source run is historical unless its actual controller is selected. */
export function mascotState(id: FamiliarId, providers: Provider[], run: Run | null, replay: boolean,
  actualExecution = false, approvals: readonly ApprovalInfo[] = [], nowMs = Date.now()): MascotState {
  if (id === 'hq') return !replay && hasFamiliarApproval(run, approvals, nowMs) ? 'waiting_approval' : 'idle'
  const providerId = FAMILIARS.find((f) => f.id === id)?.provider
  const p = providers.find((p) => p.id === providerId)
  if (actualExecution && !replay && run?.source === 'live') {
    const workers = run.workers.filter((w) => w.providerId === providerId)
    if (workers.some((w) => w.status === 'error')) return 'failed'
    const active = ['planning', 'running', 'reviewing', 'paused'].includes(run.status) ? workers.find((w) => w.status === 'working') : undefined
    if (active) return active.role === 'planner' ? 'thinking' : active.role === 'reviewer' ? 'reviewing' : 'working'
    if (!['idle', 'paused', 'stopped', 'failed'].includes(run.status) && workers.some((w) => w.status === 'done' && w.tokensOut > 0)) return 'completed'
  }
  return p?.verified && p.status === 'connected' ? 'idle' : 'offline'
}
