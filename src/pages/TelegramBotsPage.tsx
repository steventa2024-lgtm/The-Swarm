import { EvidencePanel } from '@/components/telegram/EvidencePanel'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, CheckCircle2, LockKeyhole, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/fields'
import { TelegramPanel } from '@/components/swarm/TelegramPanel'
import { TelegramBotCard, type TelegramAction } from '@/components/telegram/TelegramBotCard'
import { emptyTelegramDashboard, telegramInvoke, type TelegramApproval, type TelegramDashboard, type TelegramSettings } from '@/lib/telegramBots'
import { inTauri } from '@/providers/transport'
import { redactText } from '@/lib/redact'
import { loadRun } from '@/persistence/runStore'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'

const providerByBot: Record<string, string> = { codex: 'codex', claude: 'claude-code', gemini: 'gemini-cli', cursor: 'cursor-cli', grok: 'grok', ollama: 'ollama' }
const date = (timestamp: number) => new Date(timestamp * 1000).toLocaleString()

export function TelegramBotsPage() {
  const native = inTauri()
  const [dashboard, setDashboard] = useState<TelegramDashboard>(emptyTelegramDashboard)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const actionInFlight = useRef(false)
  const providers = useApp((s) => s.providers)
  const refresh = useCallback(async () => {
    if (native) setDashboard(await telegramInvoke<TelegramDashboard>('tg_dashboard'))
    setLoaded(true)
  }, [native])
  useEffect(() => {
    let disposed = false
    const read = async () => {
      try { const next = native ? await telegramInvoke<TelegramDashboard>('tg_dashboard') : emptyTelegramDashboard(); if (!disposed) { setDashboard(next); setLoaded(true) } }
      catch (e) { if (!disposed) setError(redactText(String(e), 'strict')) }
    }
    void read()
    const timer = native ? window.setInterval(() => { void read() }, 5000) : undefined
    return () => { disposed = true; if (timer !== undefined) window.clearInterval(timer) }
  }, [native])
  const action: TelegramAction = async (command, args = {}) => {
    if (actionInFlight.current) return
    actionInFlight.current = true
    setBusy(true); setError(''); setNotice('')
    try { await telegramInvoke(command, args); await refresh(); setNotice(command === 'tg_send_test' ? 'Test requested. Confirm receipt using the button in Telegram; a successful send alone does not prove receipt.' : command === 'tg_set_token' ? 'Token saved securely. Test the connection to verify the actual bot identity.' : command === 'tg_approval_probe' ? 'Harmless approval test requested. Use the HQ buttons to decide; the audit records the result.' : 'Configuration updated. Connection evidence is shown below.') }
    catch (e) { setError(redactText(String(e), 'strict')); try { await refresh() } catch { /* retain the original action error */ } }
    finally { actionInFlight.current = false; setBusy(false) }
  }
  const review = async (approval: TelegramApproval) => {
    try {
      const state = useSwarm.getState()
      if (approval.action === 'probe') { setNotice('This is a harmless approval probe with no proposed project files. Decide using its HQ revision buttons.'); return }
      const run = state.run?.id === approval.runId ? state.run : await loadRun(approval.runId)
      if (!run) throw new Error(`Proposal ${approval.id} belongs to run ${approval.runId}. Open its saved run before reviewing.`)
      if (state.run?.id !== run.id && !state.openRun(run)) throw new Error('Finish or stop the current run before opening another proposal.')
      useApp.getState().setPage('swarm'); useSwarm.getState().openApproval(approval.id)
    } catch (e) { setError(redactText(String(e), 'strict')) }
  }
  const providerStatus = (bot: string) => {
    if (bot === 'hq') return 'Local orchestrator · no AI login implied'
    const provider = providers.find((p) => p.id === providerByBot[bot])
    if (!provider) return bot === 'grok' ? 'Manual research · automation unavailable' : 'Not configured'
    return provider.verified && provider.status === 'connected' ? 'Last connection test passed · provider quota may vary' : provider.status === 'disconnected' ? 'Offline or authentication required' : 'Not authenticated / tested'
  }
  const hq = dashboard.bots.find((bot) => bot.id === 'hq')
  const connected = dashboard.bots.filter((bot) => bot.status === 'listening').length

  return <div className="h-full overflow-y-auto p-6"><div className="mx-auto max-w-[1280px] space-y-6">
    <PageHeader title="Telegram Bots" description="Six existing bot identities and reserved Ollama / DeepSeek slots. Local polling works while The Swarm desktop app is running; each AI provider keeps its own authentication and availability." actions={<Button variant="outline" disabled={!native || busy} onClick={() => void refresh().catch((e) => setError(redactText(String(e), 'strict')))}><RefreshCw className="h-4 w-4" />Refresh diagnostics</Button>} />
    <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1"><div className="mission-panel p-4"><p className="text-[10px] uppercase tracking-widest text-ink-3">Transport</p><p className="mt-2 font-semibold">{connected} / 8 bots listening</p><p className="mt-1 text-xs text-ink-3">One update receiver per bot. No hosting required for polling.</p></div><div className="mission-panel p-4"><p className="text-[10px] uppercase tracking-widest text-ink-3">Owner authority</p><p className="mt-2 font-semibold">{dashboard.ownerId ? 'Zero / numeric identity paired' : 'Not paired'}</p><p className="mt-1 text-xs text-ink-3">{dashboard.groupChatId ? 'Private headquarters group paired' : 'Private headquarters group not selected'}</p></div><div className="mission-panel p-4"><p className="text-[10px] uppercase tracking-widest text-ink-3">Evidence</p><p className="mt-2 font-semibold">{dashboard.deliveries.filter((delivery) => delivery.status === 'received').length} confirmed receipts</p><p className="mt-1 text-xs text-ink-3">A token, identity test, send and receipt are separate checks.</p></div></div>
    {!native && <div className="rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm text-warn">Open the updated desktop executable to enter tokens in the operating system credential store. This browser preview shows configuration only; it has no native credentials or Telegram connection.</div>}
    {!loaded && native && !error && <p className="text-xs text-ink-3">Loading native Telegram configuration…</p>}
    {error && <p role="alert" className="rounded-xl border border-bad/30 bg-bad/5 p-3 text-sm text-bad">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-ok/20 bg-ok/5 p-3 text-xs text-ink-2">{notice}</p>}
    <EvidencePanel />
    <Button disabled={!native || busy} onClick={() => void action('tg_reconnect_saved')}>Reconnect saved bots</Button>
    <section className="mission-panel p-5" aria-label="Owner pairing"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold"><LockKeyhole className="h-4 w-4 text-ok" />Pair Zero and select headquarters</h2><p className="mt-2 max-w-3xl text-xs leading-relaxed text-ink-3">Save and test HQ’s token, then start its polling worker. Pair in HQ’s private DM first. Add the bots to your private group, then pair that group from your authorized account. Numeric IDs and a native confirmation establish authority.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!native || busy || hq?.transport !== 'polling'} onClick={() => void action('tg_begin_pairing', { kind: 'owner' })}>{dashboard.ownerId ? 'Pair owner again' : 'Pair Zero'}</Button><Button variant="outline" size="sm" disabled={!native || busy || !dashboard.ownerId || hq?.transport !== 'polling'} onClick={() => void action('tg_begin_pairing', { kind: 'group' })}>Select private group</Button></div></div>
      {dashboard.pairing && <div className="mt-4 rounded-lg border border-azure-hi/30 bg-azure/5 p-4"><p className="text-xs text-ink-2">{dashboard.pairing.kind === 'owner' ? 'In HQ’s private chat, send:' : 'In your private headquarters group, send:'}</p><p className="mt-2 select-text rounded bg-night p-2 font-mono text-sm text-azure-hi">{dashboard.pairing.kind === 'owner' ? '/start' : '/pair@' + (hq?.actualUsername ?? 'ZeroPulseSwarmHQBot')} {dashboard.pairing.code}</p><p className="mt-2 text-[11px] text-ink-3">Expires {date(dashboard.pairing.expiresAt)}. Keep this one-time pairing code local.</p><p className="mt-2 text-xs text-ink-2">Candidate user: {dashboard.pairing.candidateUserId ?? 'Waiting for your message'} · chat: {dashboard.pairing.candidateChatId ?? '—'}</p><Button className="mt-3" variant="primary" size="sm" disabled={!native || busy || !dashboard.pairing.candidateUserId || !dashboard.pairing.candidateChatId} onClick={() => void action('tg_confirm_pairing')}>Confirm numeric identity on desktop</Button></div>}
      <p className="mt-3 text-[11px] text-ink-4">Usernames and display names do not authorize actions. Pairing expires, and old proposal approvals are revoked after restart.</p>
    </section>
    <section aria-label="Telegram bot identities"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Bot identities</h2><span className="text-xs text-ink-3">{dashboard.bots.filter((bot) => bot.tokenPresent).length} credentials saved</span></div><div className="grid grid-cols-3 items-start gap-4 max-xl:grid-cols-2 max-lg:grid-cols-1">{dashboard.bots.map((bot) => <TelegramBotCard key={bot.id} bot={bot} native={native} busy={busy} providerStatus={providerStatus(bot.id)} action={action} />)}</div></section>
    {loaded && <NotificationSettings key={JSON.stringify(dashboard.settings)} settings={dashboard.settings} native={native} busy={busy} action={action} />}
    <section className="mission-panel p-5" aria-label="Telegram communications"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Communications and approval evidence</h2><p className="mt-1 text-xs text-ink-3">Readable summaries follow real project and task events; opaque IDs stay in this desktop audit. Receipt checks require your interaction in Telegram.</p></div><Button variant="outline" size="sm" disabled={!native || busy || !dashboard.ownerId || !hq?.permissions.approvals || !['verified', 'listening'].includes(hq.status)} onClick={() => void action('tg_approval_probe')}>Run harmless approval test</Button></div>
      <div className="mt-4 grid grid-cols-2 gap-5 max-lg:grid-cols-1"><div><h3 className="text-xs font-semibold text-ink-2">Pending owner decisions</h3>{!dashboard.pendingApprovals.length && <p className="mt-3 text-xs text-ink-3">No live approval is pending. Personality reminders stay idle.</p>}<ul className="mt-3 space-y-2">{dashboard.pendingApprovals.map((approval) => <li key={approval.id} className="rounded-lg border hairline bg-night/40 p-3"><p className="text-xs font-medium">{approval.action === 'probe' ? 'Harmless approval probe' : `${approval.paths.length} proposed files`} · {approval.risk} risk</p><p className="mt-1 break-all font-mono text-[10px] text-ink-3">Project {approval.projectId} · task {approval.taskId}<br />Revision {approval.id}</p><p className="mt-1 text-[11px] text-ink-3">Expires {date(approval.expiresAt)}{approval.risk === 'high' ? ' · Desktop confirmation required' : ''}</p><Button className="mt-2" variant="outline" size="sm" onClick={() => void review(approval)}>Review locally<ArrowUpRight className="h-3 w-3" /></Button></li>)}</ul></div><div><h3 className="text-xs font-semibold text-ink-2">Recent delivery status</h3>{!dashboard.deliveries.length && <p className="mt-3 text-xs text-ink-3">No Telegram delivery has been attempted in this configuration.</p>}<ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">{dashboard.deliveries.map((delivery) => <li key={delivery.id} className="rounded-lg border hairline bg-night/40 p-3"><div className="flex items-center justify-between gap-2 text-xs"><strong>{delivery.botId} · {delivery.kind}</strong><span className={delivery.status === 'received' ? 'text-ok' : delivery.status === 'failed' ? 'text-bad' : 'text-ink-3'}>{delivery.status === 'received' && <CheckCircle2 className="mr-1 inline h-3 w-3" />}{delivery.status}</span></div><p className="mt-1 break-all font-mono text-[10px] text-ink-3">{delivery.reference}</p><p className="mt-1 text-[10px] text-ink-4">{date(delivery.at)}</p>{delivery.error && <p className="mt-1 text-xs text-bad">{delivery.error}</p>}</li>)}</ul></div></div>
    </section>
    <section className="mission-panel p-5" aria-label="Telegram owner commands"><h2 className="font-semibold">Owner commands</h2><p className="mt-2 break-words font-mono text-xs text-azure-hi">/start · /help · /status · /agents · /projects · /tasks · /approvals · /preview · /recording · /files · /pause · /resume</p><p className="mt-2 text-xs leading-relaxed text-ink-3">Commands require Zero’s paired numeric account and an allowed chat. Pause and resume affect the actual active workflow; the bot reports when no workflow is available. Bots ignore other bots and never start reply loops.</p></section>
    <details className="mission-panel p-5"><summary className="cursor-pointer text-sm font-semibold text-ink-2">Existing HTTPS webhook and voice setup</summary><p className="my-3 text-xs leading-relaxed text-ink-3">The original single-HQ webhook transport and voice controls remain available. Use either a webhook or polling for a given bot; stop its polling worker before registering a webhook. This advanced path uses the original separate credential names.</p><TelegramPanel /></details>
  </div></div>
}

function NotificationSettings({ settings, native, busy, action }: { settings: TelegramSettings; native: boolean; busy: boolean; action: TelegramAction }) {
  const [draft, setDraft] = useState(settings)
  const toggle = (field: 'notifications' | 'criticalAlerts' | 'personalities' | 'reminders', label: string) => <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" className="accent-[#3b82ff]" checked={draft[field]} disabled={!native || busy} onChange={(e) => setDraft((s) => ({ ...s, [field]: e.target.checked }))} />{label}</label>
  return <form className="mission-panel space-y-4 p-5" aria-label="Telegram notification preferences" onSubmit={(e) => { e.preventDefault(); void action('tg_save_settings', { settings: draft }) }}><div><h2 className="font-semibold">Notification preferences</h2><p className="mt-1 text-xs text-ink-3">Deduplicated, bounded notifications. Personalities change wording only; reminders require a legitimate pending approval.</p></div><div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">{toggle('notifications', 'Task notifications')}{toggle('criticalAlerts', 'Critical alerts')}{toggle('personalities', 'Personality wording')}{toggle('reminders', '“Where’s Zero?” reminders')}</div><div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2"><label className="text-xs text-ink-3">Minimum interval · seconds<Input className="mt-1" type="number" min={5} max={3600} value={draft.minIntervalSecs} disabled={!native || busy} onChange={(e) => setDraft((s) => ({ ...s, minIntervalSecs: Number(e.target.value) }))} /></label><label className="text-xs text-ink-3">Reminder delay · seconds<Input className="mt-1" type="number" min={60} max={86400} value={draft.reminderDelaySecs} disabled={!native || busy} onChange={(e) => setDraft((s) => ({ ...s, reminderDelaySecs: Number(e.target.value) }))} /></label><label className="text-xs text-ink-3">Maximum reminders · 0–3<Input className="mt-1" type="number" min={0} max={3} value={draft.maxReminders} disabled={!native || busy} onChange={(e) => setDraft((s) => ({ ...s, maxReminders: Number(e.target.value) }))} /></label><div className="space-y-2"><label className="flex items-center gap-2 text-xs text-ink-3"><input type="checkbox" className="accent-[#3b82ff]" checked={draft.quietStart !== null} disabled={!native || busy} onChange={(e) => setDraft((s) => ({ ...s, quietStart: e.target.checked ? 22 : null, quietEnd: e.target.checked ? 7 : null }))} />Quiet hours · UTC</label>{draft.quietStart !== null && <div className="flex items-center gap-2"><Input aria-label="Quiet hours start UTC" type="number" min={0} max={23} value={draft.quietStart} disabled={!native || busy} onChange={(e) => setDraft((s) => ({ ...s, quietStart: Number(e.target.value) }))} /><span className="text-xs text-ink-3">to</span><Input aria-label="Quiet hours end UTC" type="number" min={0} max={23} value={draft.quietEnd ?? 7} disabled={!native || busy} onChange={(e) => setDraft((s) => ({ ...s, quietEnd: Number(e.target.value) }))} /></div>}</div></div><p className="text-[11px] text-ink-4">Polling is active only while this desktop app runs. Reconnect after restarting; offsets and diagnostics persist, approval authority does not.</p><Button type="submit" variant="primary" size="sm" disabled={!native || busy}>Save notification preferences</Button></form>
}
