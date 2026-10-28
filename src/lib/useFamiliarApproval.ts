import { useEffect, useState } from 'react'
import type { ApprovalInfo } from '@/lib/fsBridge'
import { inTauri } from '@/providers/transport'

/** One read-only native observer shared by the roster. It cannot stage or decide. */
export function useFamiliarApproval(enabled: boolean) {
  const [approvals, setApprovals] = useState<ApprovalInfo[]>([])
  const [nowMs, setNowMs] = useState(Date.now)
  useEffect(() => {
    if (!enabled || !inTauri()) return
    let disposed = false, inFlight = false, version = 0
    let unlisten: (() => void) | undefined
    const refresh = async () => {
      setNowMs(Date.now())
      if (inFlight) return
      inFlight = true
      const requestedVersion = version
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const rows = await invoke<ApprovalInfo[]>('approval_pending')
        if (!disposed && requestedVersion === version) setApprovals(Array.isArray(rows) ? rows : [])
      } catch { if (!disposed && requestedVersion === version) setApprovals([]) }
      finally { inFlight = false }
    }
    const onWake = () => { void refresh() }
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const stop = await listen<{ id: string; status: string }>('swarm-approval', ({ payload }) => {
        if (disposed) return
        version++ // A response captured before this decision must not restore stale evidence.
        setApprovals((rows) => rows.filter((row) => row.id !== payload.id))
        void refresh()
      })
      if (disposed) stop(); else unlisten = stop
    }).catch(() => { if (!disposed) setApprovals([]) })
    void refresh()
    const timer = window.setInterval(onWake, 1000)
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)
    return () => { disposed = true; unlisten?.(); window.clearInterval(timer); window.removeEventListener('focus', onWake); document.removeEventListener('visibilitychange', onWake) }
  }, [enabled])
  return { approvals: enabled && inTauri() ? approvals : [], nowMs }
}
