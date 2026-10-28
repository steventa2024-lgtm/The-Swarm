import { useEffect, useRef, useState } from 'react'
import type { Run } from '@/types'
import type { ApprovalInfo } from './fsBridge'
import { deriveFamiliarInteractions, type FamiliarInteraction } from './familiarInteractions'
export interface VisibleFamiliarInteraction extends FamiliarInteraction { observedAt: number }

/** Mounting a historical view never replays old cues. This observer cannot run tools. */
export function useFamiliarInteractions(run: Run | null, actual: boolean, replay: boolean, approvals: ApprovalInfo[]) {
  const baseline = useRef(false), runId = useRef<string | null>(null), eligibleBefore = useRef(false), seen = useRef(new Set<string>())
  const [visible, setVisible] = useState<VisibleFamiliarInteraction[]>([])
  useEffect(() => {
    const candidates = deriveFamiliarInteractions(run, actual, replay, approvals), now = Date.now()
    const eligible = actual && !replay && run?.source === 'live' && !['idle', 'stopped', 'failed'].includes(run.status)
    if (!baseline.current || runId.current !== (run?.id ?? null) || eligible !== eligibleBefore.current) {
      baseline.current = true; runId.current = run?.id ?? null; eligibleBefore.current = eligible
      seen.current.clear(); candidates.forEach((e) => seen.current.add(e.id)); setVisible((old) => old.length ? [] : old)
      return
    }
    if (!eligible) { setVisible((old) => old.length ? [] : old); return }
    const pending = new Set(approvals.map((a) => `${run!.id}:approval:${a.id}`))
    setVisible((old) => { const next = old.filter((e) => e.kind !== 'approval' || pending.has(e.id)); return next.length === old.length ? old : next })
    const fresh = candidates.filter((e) => !seen.current.has(e.id) && e.at <= now + 1000 && now - e.at < 6000)
    candidates.forEach((e) => seen.current.add(e.id))
    while (seen.current.size > 256) seen.current.delete(seen.current.values().next().value!)
    if (fresh.length) setVisible((old) => [...old.filter((e) => now - e.observedAt < 3000), ...fresh.map((e) => ({ ...e, observedAt: now }))].slice(-6))
  }, [run, actual, replay, approvals])
  useEffect(() => { if (!visible.length) return; const timer = window.setInterval(() => setVisible((old) => { const next = old.filter((e) => Date.now() - e.observedAt < 3000); return next.length === old.length ? old : next }), 250); return () => window.clearInterval(timer) }, [visible.length])
  return visible
}
