import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, X } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useSwarm } from '@/store/swarm'
import { formatCost, formatDuration, formatTokens } from '@/lib/utils'
import type { Run } from '@/types'

export function FinalOutputModal({ run, open, onClose }: { run: Run | null; open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const out = run?.finalOutput
  return (
    <AnimatePresence>
      {open && run && out && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-void/70 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="glass selectable w-full max-w-[560px] rounded-3xl p-6 shadow-glow"
            role="dialog" aria-modal aria-label="Final output"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ok/15 text-ok shadow-[inset_0_0_0_1px_rgba(45,212,191,0.4)]"><CheckCircle2 className="h-5 w-5" /></span>
                <div>
                  <h3 className="text-[16px] font-semibold text-ink">{out.headline}</h3>
                  <p className="text-xs text-ink-3">
                    {formatDuration(run.elapsedMs)} · {formatTokens(run.metrics.tokensIn + run.metrics.tokensOut)} tokens · {formatCost(run.metrics.costUsd)}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
            </div>

            <ul className="mt-5 space-y-2">
              {out.summary.map((s) => (
                <li key={s} className="flex gap-2 text-[13px] text-ink-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure-hi" />{s}</li>
              ))}
            </ul>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {[['Files', out.filesChanged], ['Added', `+${out.additions}`], ['Removed', `−${out.deletions}`]].map(([k, v]) => (
                <div key={k} className="rounded-xl border hairline bg-white/[0.03] p-3 text-center">
                  <p className="font-mono text-lg font-semibold text-ink">{v}</p>
                  <p className="text-[10.5px] uppercase tracking-wider text-ink-3">{k}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-1.5">
              {out.checks.map((c) => (
                <span key={c.label} className="inline-flex items-center gap-1 rounded-full border border-ok/30 bg-ok/10 px-2.5 py-0.5 text-[11px] text-ok">
                  <CheckCircle2 className="h-3 w-3" />{c.label}
                </span>
              ))}
            </div>

            {run.fileChanges.some((f) => f.content !== undefined) && (
              <Button variant="primary" className="mt-5 w-full" onClick={() => { onClose(); useSwarm.getState().setApplyOpen(true) }}>
                Review & apply {new Set(run.fileChanges.filter((f) => f.content !== undefined).map((f) => f.path)).size} proposed files
              </Button>
            )}

            <div className="mt-5 border-t hairline pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Suggested next steps</p>
              <ul className="mt-2 space-y-1.5">
                {out.nextSteps.map((s) => <li key={s} className="text-[12.5px] text-ink-2">→ {s}</li>)}
              </ul>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
