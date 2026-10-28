import { useEffect, useState } from 'react'
import { inTauri } from '@/providers/transport'
import { KeyField } from '@/components/common/KeyField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/fields'

interface Status { enabled: boolean; tokenPresent: boolean; webhookSecretPresent: boolean; error: string | null; voices: { id: string; duration: number }[] }
export function TelegramPanel() {
  const [status, setStatus] = useState<Status | null>(null), [owner, setOwner] = useState(''), [chat, setChat] = useState(''), [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [audio, setAudio] = useState(''), [file, setFile] = useState<File | null>(null)
  const refresh = async () => { if (inTauri()) { const { invoke } = await import('@tauri-apps/api/core'); setStatus(await invoke<Status>('telegram_status')) } }
  useEffect(() => { void refresh().catch(() => setError('Telegram status unavailable.')) }, [])
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio) }, [audio])
  const action = async (command: string, args: Record<string, unknown> = {}) => {
    setBusy(true); setError('')
    try { const { invoke } = await import('@tauri-apps/api/core'); await invoke(command, args); await refresh() } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  return <section className="mission-panel space-y-4 p-5">
    <div className="flex items-center justify-between"><h2 className="font-semibold">Telegram · optional owner channel</h2><span className={status?.enabled ? 'text-ok' : 'text-ink-3'}>{status?.enabled ? 'Webhook registered' : 'Disconnected'}</span></div>
    <p className="max-w-3xl text-xs leading-relaxed text-ink-3">Fixed high-level summaries and revision-specific approval buttons. Prompts, code, filenames and secrets are never included in automatic messages. Voice notes are attachments for local playback; they never authorize a change.</p>
    {!inTauri() ? <p className="text-xs text-warn">Open the desktop app to configure secrets, owner identity, webhook, and voice notes.</p> : <>
      <div className="grid grid-cols-2 gap-4"><div><p className="text-xs">Bot token from @BotFather</p><KeyField name="TELEGRAM_BOT_TOKEN" /></div><div><p className="text-xs">Random webhook secret · 32–256 letters, digits, _ or -</p><KeyField name="TELEGRAM_WEBHOOK_TOKEN" /></div></div>
      <div className="grid grid-cols-3 gap-3"><label className="text-xs text-ink-3">Zero’s numeric Telegram user ID<Input value={owner} onChange={(e) => setOwner(e.target.value)} inputMode="numeric" /></label><label className="text-xs text-ink-3">Private chat ID<Input value={chat} onChange={(e) => setChat(e.target.value)} inputMode="numeric" /></label><label className="text-xs text-ink-3">Public HTTPS webhook URL<Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://host/telegram/webhook" /></label></div>
      <p className="text-xs text-ink-3">Expose only <code>/telegram/webhook</code> from localhost:9462 using an HTTPS reverse proxy or tunnel. Start your bot’s private chat first. Native confirmation binds Zero’s identity. Reconnect after restarting the app; old approval buttons are revoked.</p>
      <div className="flex gap-2"><Button disabled={busy} variant="primary" onClick={() => void action(status?.enabled ? 'telegram_stop' : 'telegram_start', status?.enabled ? {} : { config: { ownerId: Number(owner), chatId: Number(chat), webhookUrl: url } })}>{busy ? 'Working…' : status?.enabled ? 'Disconnect' : 'Register webhook'}</Button><Button variant="outline" disabled={busy} onClick={() => void refresh().catch((e) => setError(String(e)))}>Refresh status & inbox</Button></div>
      <div className="border-t hairline pt-4"><h3 className="text-sm font-medium">Voice notes</h3><p className="mt-1 text-xs text-ink-3">Select a high-level OGG, MP3 or M4A note under 5 MB. Preview it before the native send confirmation.</p><input className="mt-2 block text-xs" aria-label="Choose voice note" type="file" accept=".ogg,.mp3,.m4a" onChange={(e) => { const picked = e.target.files?.[0] ?? null; setFile(picked); setAudio(picked ? URL.createObjectURL(picked) : '') }} />
        {audio && <audio className="mt-3 w-full" controls src={audio} />}
        <Button className="mt-2" variant="outline" size="sm" disabled={busy || !file || !status?.enabled} onClick={async () => { if (file) await action('telegram_send_voice', { bytes: Array.from(new Uint8Array(await file.arrayBuffer())), format: file.name.split('.').at(-1)?.toLowerCase() }) }}>Send voice note</Button>
        {status?.voices.map((voice) => <button key={voice.id} className="mt-3 block text-xs text-azure-hi" onClick={async () => { try { const { invoke } = await import('@tauri-apps/api/core'); const bytes = await invoke<number[]>('telegram_voice', { id: voice.id }); setFile(null); setAudio(URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'audio/ogg' }))) } catch (e) { setError(String(e)) } }}>Play received note · {voice.duration}s</button>)}
      </div>
    </>}
    {(error || status?.error) && <p role="alert" className="text-xs text-bad">{error || status?.error}</p>}
    <a className="inline-block text-xs text-azure-hi underline" href="https://core.telegram.org/bots/api#setwebhook" target="_blank" rel="noreferrer">Telegram webhook documentation ↗</a>
  </section>
}
