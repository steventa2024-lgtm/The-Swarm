import { KeyRound, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/fields'
import { keyStatus, removeKey, saveKey, secretsAvailable, type KeySource } from '@/lib/secrets'

/** Lets the user store an API key in the OS credential store. The key is never shown again. */
export function KeyField({ name, onChange }: { name: string; onChange?: () => void }) {
  const [source, setSource] = useState<KeySource | 'unknown'>('unknown')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!secretsAvailable()) return
    keyStatus(name).then(setSource).catch(() => setSource('none'))
  }, [name])
  useEffect(refresh, [refresh])

  if (!secretsAvailable()) {
    return <p className="mt-2 rounded-lg border border-warn/30 bg-warn/10 p-2 text-[11px] text-warn">Keys are stored by the desktop app. Open ZeroPulse Swarm from your desktop (not this browser preview) to add yours.</p>
  }

  const save = async () => {
    setBusy(true); setError(null)
    try { await saveKey(name, value); setValue(''); refresh(); onChange?.() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }
  const remove = async () => {
    setBusy(true); setError(null)
    try { await removeKey(name); refresh(); onChange?.() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }

  return (
    <div className="mt-2.5 rounded-xl border hairline bg-white/[0.02] p-2.5">
      <p className="flex items-center gap-1.5 text-[11px]">
        {source === 'keychain' ? <><ShieldCheck className="h-3.5 w-3.5 text-ok" /><span className="text-ok">Key saved in Windows Credential Manager</span></>
          : source === 'env' ? <><ShieldCheck className="h-3.5 w-3.5 text-ok" /><span className="text-ok">Using the {name} environment variable</span></>
          : <><KeyRound className="h-3.5 w-3.5 text-ink-3" /><span className="text-ink-3">No key yet</span></>}
      </p>
      <div className="mt-2 flex gap-1.5">
        <Input
          type="password" autoComplete="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={source === 'keychain' ? 'Paste a new key to replace it' : 'Paste your API key'}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && save()} className="h-8 font-mono text-xs" aria-label={`${name} value`}
        />
        <Button variant="primary" size="sm" disabled={busy || !value.trim()} onClick={save}>Save</Button>
        {source === 'keychain' && <Button variant="ghost" size="sm" disabled={busy} onClick={remove}>Remove</Button>}
      </div>
      {error && <p className="mt-1.5 text-[11px] text-bad">{error}</p>}
    </div>
  )
}
