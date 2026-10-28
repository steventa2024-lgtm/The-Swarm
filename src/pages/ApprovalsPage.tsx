import { useEffect, useState } from 'react'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'
import { telegramInvoke, type TelegramApproval } from '@/lib/telegramBots'
import { inTauri } from '@/providers/transport'
import { loadRun } from '@/persistence/runStore'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
export function ApprovalsPage() {
  const [rows, setRows] = useState<TelegramApproval[]>([]), [error, setError] = useState('')
  const projects = useApp((s) => s.projects)
  useEffect(() => {
    if (!inTauri()) return
    let disposed = false
    const refresh = () => telegramInvoke<TelegramApproval[]>('approval_pending').then((r) => { if (!disposed) setRows(r) }).catch((e) => { if (!disposed) setError(String(e)) })
    void refresh(); const timer = window.setInterval(() => { void refresh() }, 5000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [])
  const review = async (a: TelegramApproval) => {
    try {
      const run = await loadRun(a.runId)
      if (!run || !useSwarm.getState().openRun(run)) throw new Error('Finish the current project run, then open its exact revision from Telegram Bots.')
      useApp.getState().setPage('swarm'); useSwarm.getState().openApproval(a.id)
    } catch (e) { setError(String(e)) }
  }
  return <div className="h-full space-y-5 overflow-y-auto p-6"><PageHeader title="Owner approvals" description="Only Zero decides. These are actual native staged revisions, with one-time authority and expiry." />
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    {!rows.length && <section className="mission-panel p-6 text-sm text-ink-3">No current native approval is pending. Completed tasks remain proposals until staged and explicitly approved. Restarted approvals must be staged again.</section>}
    {rows.map((a) => <section key={a.id} className="mission-panel space-y-3 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{projects.find((p) => p.id === a.projectId)?.name ?? 'Harmless approval probe'}</h2><span className="text-xs text-warn">{a.risk} risk · {a.status}</span></div><p className="text-xs">{a.action === 'probe' ? 'Harmless decision test · contains no project files' : `${a.paths.length} immutable proposed files`}</p><ul className="space-y-1 text-xs text-ink-3">{a.paths.map((p) => <li key={p}>{p}</li>)}</ul><p className="text-xs text-ink-3">Expires {new Date(a.expiresAt * 1000).toLocaleString()} · {a.risk === 'high' ? 'Native confirmation required after Telegram intent' : 'Exact owner decision required'}</p><p className="selectable break-all font-mono text-[10px] text-ink-4">Audit revision: {a.id}</p><Button size="sm" disabled={a.action === 'probe'} onClick={() => void review(a)}>Review exact diff & checks</Button></section>)}
    <p className="text-xs text-ink-4">Proposal content and review evidence open through the existing immutable Review and Apply flow. No agent, replay frame or personality can click approval on your behalf.</p>
  </div>
}
