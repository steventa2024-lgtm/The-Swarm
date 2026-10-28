import { useState } from 'react'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'
import { inTauri } from '@/providers/transport'
import { telegramInvoke } from '@/lib/telegramBots'
import { redactText } from '@/lib/redact'

/** Explicit own-window capture only. This component never sends media or decides approvals. */
export function FamiliarRecordingControls({ preview = false }: { preview?: boolean }) {
  const run = useSwarm((s) => s.run), replay = useSwarm((s) => s.replaying)
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const approved = run?.source === 'live' && !replay && run.ownerDecision?.status === 'applied'
  const record = async () => {
    if (!inTauri() || (!preview && !approved) || busy) return
    setBusy(true); setNotice('')
    try { await telegramInvoke('capture_evidence', { record: true }); setNotice('Actual Swarm window MP4 saved. Inspect it in Telegram Bots → Evidence before manually sending it. No media was sent automatically.') }
    catch (error) { setNotice(redactText(String(error), 'strict')) }
    finally { setBusy(false) }
  }
  return <details className="rounded-lg border border-line p-3 text-xs text-ink-3"><summary className="cursor-pointer">Optional {preview ? '3D preview' : 'approved milestone'} recording</summary><div className="mt-3 space-y-3">
    <p>{preview ? 'PREVIEW RECORDING · This does not represent an agent task or project milestone.' : approved ? `OWNER-APPROVED MILESTONE · ${run.task.title}. This is the current applied revision; recording does not grant another approval.` : 'No owner-approved milestone is available. A model review or completed task alone cannot enable milestone recording.'}</p>
    <p>Record only the actual Swarm window for 15 seconds, with the existing native consent dialog and capture indicator. Keep the 3D scene visible. No microphone, bot profile changes or automatic media notifications.</p>
    <div className="flex flex-wrap gap-3"><button className="rounded-lg border border-azure-hi/30 px-3 py-2 text-azure-hi disabled:opacity-40" disabled={!inTauri() || busy || (!preview && !approved)} onClick={() => void record()}>{busy ? 'Recording / awaiting native consent…' : 'Record actual 3D window MP4…'}</button><button className="text-azure-hi" onClick={() => useApp.getState().setPage('telegram')}>Open Telegram evidence →</button></div>
    {!inTauri() && <p>Native capture requires the desktop build. Browser preview cannot capture or send desktop evidence.</p>}
    {notice && <p role="status">{notice}</p>}
  </div></details>
}
