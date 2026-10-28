import { artifactLink } from '@/lib/artifactLinks'
import { useEffect, useState } from 'react'
import { useApp } from '@/store/app'
import { telegramInvoke } from '@/lib/telegramBots'
import { inTauri } from '@/providers/transport'
import { redactText } from '@/lib/redact'
import { Button } from '@/components/ui/button'
interface Evidence { id: string; name: string; kind: string; size: number; createdAt: number; digest: string }
export function EvidencePanel() {
  const project = useApp((s) => s.projects.find((p) => p.id === s.activeProjectId))
  const [rows, setRows] = useState<Evidence[]>([]), [busy, setBusy] = useState(false), [capturing, setCapturing] = useState(false), [notice, setNotice] = useState('')
  const refresh = () => telegramInvoke<Evidence[]>('media_list').then(setRows)
  useEffect(() => { if (inTauri()) void refresh().catch(() => {}) }, [])
  useEffect(() => {
    if (!inTauri()) return
    let stop: (() => void) | undefined, disposed = false
    void import('@tauri-apps/api/event').then(async ({ listen }) => { const off = await listen<boolean>('capture-state', ({ payload }) => setCapturing(payload)); if (disposed) off(); else stop = off })
    return () => { disposed = true; stop?.() }
  }, [])
  const act = async (command: string, args = {}) => {
    setBusy(true); setNotice('')
    try { if (command === 'capture_evidence') { useApp.getState().setPage('swarm'); await new Promise((r) => setTimeout(r, 350)) } await telegramInvoke(command, args); await refresh(); setNotice(command === 'tg_send_media' ? 'Telegram accepted the upload. Phone playback/receipt still requires your confirmation.' : 'Evidence saved locally. Inspect it before choosing Send to Telegram.') }
    catch (e) { setNotice(redactText(String(e), 'strict')) } finally { setBusy(false) }
  }
  return <section className="mission-panel space-y-3 p-5" aria-label="Approved evidence">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Evidence on your phone</h2><p className="mt-1 text-xs text-ink-3">Own Swarm window only. Each capture or import needs native consent. {artifactLink('http://127.0.0.1').reason}</p></div><span className="text-[10px] text-ink-3">{project?.name}</span></div>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={!inTauri() || busy} onClick={() => void act('capture_evidence', { record: false })}>Capture Swarm window…</Button>
      <Button size="sm" disabled={!inTauri() || busy} onClick={() => void act('capture_evidence', { record: true })}>Record 15 seconds…</Button>
      <Button size="sm" disabled={!inTauri() || busy || !project?.root} onClick={() => void act('media_import', { root: project?.root })}>Import project evidence…</Button>
      {capturing && <button className="rounded-lg border border-red-400 bg-red-950 px-3 text-xs text-white" onClick={() => void telegramInvoke('capture_stop')}>● Capturing own window · Stop</button>}
    </div>
    {notice && <p role="status" className="text-xs text-azure-hi">{notice}</p>}
    <ul className="max-h-56 space-y-2 overflow-y-auto">{rows.map((a) => <li key={a.id} className="flex items-center gap-3 rounded-lg border hairline p-3 text-xs"><div className="min-w-0 flex-1"><p className="truncate">{a.name}</p><p className="mt-1 text-ink-3">{a.kind} · {(a.size / 1024).toFixed(0)} KB · Owner-authorized snapshot</p></div><Button size="sm" disabled={busy} onClick={() => void act('tg_send_media', { artifactId: a.id })}>Send to Telegram</Button></li>)}</ul>
    {!rows.length && <p className="text-xs text-ink-4">No approved evidence yet. /preview, /recording and /files never start an unsolicited capture.</p>}
  </section>
}
