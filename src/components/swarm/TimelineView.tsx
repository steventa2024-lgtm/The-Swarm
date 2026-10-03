import { motion } from 'framer-motion'
import { CheckCircle2, Circle, GanttChart, Loader2 } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { ROLE_META } from '@/lib/meta'
import { cn, formatDuration } from '@/lib/utils'
import type { Run } from '@/types'

export function TimelineView({ run }: { run: Run | null }) {
  if (!run) {
    return <EmptyState icon={GanttChart} title="Timeline is empty" description="Start a run to see each worker's schedule on a shared clock." className="py-24" />
  }
  const span = Math.max(run.elapsedMs, 8000)
  const ticks = Array.from({ length: 5 }, (_, i) => (span / 4) * i)

  return (
    <div className="space-y-5">
      <ol className="grid grid-cols-5 gap-2">
        {run.timeline.map((t) => (
          <li key={t.id} className={cn('glass rounded-xl p-2.5', t.status === 'active' && 'glass-active')}>
            <div className="flex items-center gap-1.5">
              {t.status === 'done' ? <CheckCircle2 className="h-3.5 w-3.5 text-ok" /> : t.status === 'active' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-azure-hi" /> : <Circle className="h-3.5 w-3.5 text-ink-4" />}
              <span className={cn('truncate text-[11.5px] font-medium', t.status === 'pending' ? 'text-ink-4' : 'text-ink')}>{t.label}</span>
            </div>
          </li>
        ))}
      </ol>

      <div className="glass rounded-2xl p-4">
        <div className="relative ml-[130px] mb-2 h-4">
          {ticks.map((t, i) => (
            <span key={i} className="absolute -translate-x-1/2 font-mono text-[10px] text-ink-4" style={{ left: `${(i / 4) * 100}%` }}>{formatDuration(t)}</span>
          ))}
        </div>
        <div className="space-y-2">
          {run.workers.map((w) => {
            const start = w.role === 'planner' ? 0 : w.startedAt
            const end = w.endedAt ?? run.elapsedMs
            const color = ROLE_META[w.role].color
            return (
              <div key={w.id} className="flex items-center gap-3">
                <div className="w-[118px] shrink-0 truncate text-[11.5px] text-ink-2">{ROLE_META[w.role].short}</div>
                <div className="relative h-7 flex-1 rounded-lg bg-white/[0.03]">
                  {ticks.map((_, i) => <span key={i} className="absolute inset-y-0 w-px bg-white/[0.05]" style={{ left: `${(i / 4) * 100}%` }} />)}
                  {start !== undefined && (
                    <motion.div
                      className="absolute inset-y-1 overflow-hidden rounded-md"
                      animate={{ left: `${(start / span) * 100}%`, width: `${Math.max(0.5, ((end - start) / span) * 100)}%` }}
                      transition={{ duration: 0.25, ease: 'linear' }}
                      style={{ background: `linear-gradient(90deg, ${color}55, ${color}bb)`, boxShadow: w.status === 'working' ? `0 0 14px ${color}88` : undefined }}
                    >
                      <span className="absolute inset-y-0 left-2 flex items-center font-mono text-[10px] text-white/90">{Math.round(w.progress)}%</span>
                    </motion.div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
