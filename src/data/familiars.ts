import type { Provider, Run } from '@/types'
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
/** Auth health is displayed separately; visual task state comes only from actual executions. */
export function mascotState(id: FamiliarId, providers: Provider[], run: Run | null, replay: boolean): MascotState {
  if (id === 'hq') return run?.source === 'live' && !replay && run.status === 'completed' && run.reviewVerdict === 'approved' && !['applied', 'rejected'].includes(run.ownerDecision?.status ?? '') ? 'waiting_approval' : 'idle'
  const p = providers.find((p) => p.id === FAMILIARS.find((f) => f.id === id)?.provider)
  if (run?.source === 'live') {
    const workers = run.workers.filter((w) => w.providerId === p?.id)
    if (workers.some((w) => w.status === 'error')) return 'failed'
    const active = workers.find((w) => w.status === 'working')
    if (active) return active.role === 'planner' ? 'thinking' : active.role === 'reviewer' ? 'reviewing' : 'working'
    if (workers.some((w) => w.status === 'done' && w.tokensOut > 0)) return 'completed'
  }
  return p?.verified && p.status === 'connected' ? 'idle' : 'offline'
}
