import { useEffect, useState } from 'react'
import { inTauri } from '@/providers/transport'
import { telegramInvoke } from '@/lib/telegramBots'
export function CaptureIndicator() {
  const [active, setActive] = useState(false)
  useEffect(() => {
    if (!inTauri()) return
    let disposed = false, stop: (() => void) | undefined
    void import('@tauri-apps/api/event').then(async ({ listen }) => { const off = await listen<boolean>('capture-state', ({ payload }) => setActive(payload)); if (disposed) off(); else stop = off })
    return () => { disposed = true; stop?.() }
  }, [])
  return active ? <div role="status" className="fixed right-5 top-24 z-[100] flex items-center gap-4 rounded-xl border border-red-300 bg-red-950 px-4 py-3 text-xs text-white shadow-xl">● Recording / own Swarm window only<button className="rounded border px-3 py-1" onClick={() => void telegramInvoke('capture_stop')}>Stop capture</button></div> : null
}
