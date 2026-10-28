import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'
import { operationalEvents } from './telegramEvents'
import { loadRun } from '@/persistence/runStore'

/** A single bridge for the real orchestrator. Browser previews and replay never publish activity. */
export async function connectTelegramWorkspace(): Promise<() => void> {
  const { invoke } = await import('@tauri-apps/api/core')
  const { listen } = await import('@tauri-apps/api/event')
  let closed = false
  let syncSignature = ''
  const published = new Set<string>()
  const update = () => {
    if (closed) return
    const app = useApp.getState(), swarm = useSwarm.getState()
    const run = !swarm.replaying && swarm.runIsLive ? swarm.run : null
    const workspace = {
      projects: app.projects.map((p) => ({ id: p.id, name: p.name, status: p.status })),
      agents: app.agents.map((a) => {
        const p = app.providers.find((provider) => provider.id === a.providerId)
        const failed = run?.workers.some((w) => w.agentId === a.id && w.status === 'error')
        return { id: a.providerId, name: p?.name ?? a.providerId, status: !a.enabled ? 'disabled' : failed ? 'error' : p?.verified && p.status === 'connected' ? 'ready' : 'offline' }
      }),
      tasks: run ? [{ id: run.task.id, title: run.task.title, projectId: run.task.projectId, runId: run.id, status: run.status }] : [],
      activeRunId: run?.id ?? null,
      activeStatus: run?.status ?? null,
    }
    const signature = JSON.stringify(workspace)
    if (signature !== syncSignature) {
      syncSignature = signature
      void invoke('tg_sync_workspace', { workspace }).catch(() => { syncSignature = '' })
    }
    if (run) for (const event of operationalEvents(run, app.projects.find((p) => p.id === run.task.projectId)?.name)) {
      if (published.has(event.id)) continue
      published.add(event.id)
      if (published.size > 2000) published.delete(published.values().next().value!)
      void invoke('tg_publish_event', { event }).catch(() => { published.delete(event.id) })
    }
  }
  const stopCommands = await listen<{ requestId: string; command: string; runId: string }>('tg-command', ({ payload }) => {
    const swarm = useSwarm.getState()
    let applied = false
    if (swarm.runIsLive && !swarm.replaying && swarm.run?.id === payload.runId) {
      if (payload.command === 'pause' && ['planning', 'running', 'reviewing'].includes(swarm.run.status)) { swarm.pause(); applied = useSwarm.getState().run?.status === 'paused' }
      else if (payload.command === 'resume' && swarm.run.status === 'paused') { swarm.resume(); applied = useSwarm.getState().run?.status !== 'paused' }
    }
    void invoke('tg_command_result', { requestId: payload.requestId, runId: payload.runId, applied }).catch(() => {})
    update()
  })
  const stopReview = await listen<{ runId: string; approvalId: string }>('tg-review', async ({ payload }) => {
    if (closed) return
    const swarm = useSwarm.getState()
    if (swarm.run?.id === payload.runId) { useApp.getState().setPage('swarm'); swarm.openApproval(payload.approvalId); return }
    const run = await loadRun(payload.runId)
    if (!closed && run && useSwarm.getState().openRun(run)) { useApp.getState().setPage('swarm'); useSwarm.getState().openApproval(payload.approvalId) }
  })
  const stopApp = useApp.subscribe(update), stopSwarm = useSwarm.subscribe(update)
  // Heartbeat lets native commands distinguish a present UI from a crashed webview.
  const heartbeat = window.setInterval(() => { syncSignature = ''; update() }, 30_000)
  update()
  return () => { closed = true; stopApp(); stopSwarm(); stopCommands(); stopReview(); window.clearInterval(heartbeat) }
}
