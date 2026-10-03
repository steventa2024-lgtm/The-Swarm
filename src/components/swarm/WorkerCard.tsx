import { motion } from 'framer-motion'
import { ChevronRight, Clock, FileCode2 } from 'lucide-react'
import { ROLE_META, WORKER_STATUS_META } from '@/lib/meta'
import { basename, cn, formatDuration, formatTokens } from '@/lib/utils'
import { ProgressBar } from '@/components/common/ProgressBar'
import { ProviderTag } from '@/components/common/ProviderTag'
import { StatusDot } from '@/components/common/StatusBadge'
import type { Worker } from '@/types'

export function WorkerCard({
  worker, expanded, selected, onToggle,
}: { worker: Worker; expanded: boolean; selected: boolean; onToggle: () => void }) {
  const role = ROLE_META[worker.role]
  const status = WORKER_STATUS_META[worker.status]
  const Icon = role.icon
  const live = worker.status === 'working'

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onToggle}
      className={cn(
        'glass glass-hover cursor-pointer rounded-2xl p-3',
        live && 'glass-active',
        selected && 'border-azure-hi/70 shadow-[0_0_28px_-8px_rgba(59,130,255,0.8)]',
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${role.color}1f`, color: role.color, boxShadow: live ? `0 0 18px -2px ${role.color}aa` : `inset 0 0 0 1px ${role.color}33` }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-semibold text-ink">{worker.name}</p>
            <StatusDot tone={status.tone} live={status.live} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <ProviderTag providerId={worker.providerId} label={worker.modelLabel} compact />
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[17px] font-semibold leading-none tabular-nums" style={{ color: role.color }}>{Math.round(worker.progress)}<span className="text-[11px] text-ink-3">%</span></p>
          <p className="mt-1 text-[10px] text-ink-3">{status.label}</p>
        </div>
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-ink-4 transition-transform', expanded && 'rotate-90')} />
      </div>

      <ProgressBar value={worker.progress} color={role.color} className="mt-2.5" live={live} />

      {expanded && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
          {worker.brief && (
            <p className="mt-2.5 rounded-lg border border-azure/20 bg-azure/[0.06] p-2 text-[11px] leading-snug text-ink-2">
              <span className="font-semibold text-azure-hi">Its slice of your prompt · </span>{worker.brief.length > 230 ? `${worker.brief.slice(0, 230)}…` : worker.brief}
            </p>
          )}
          <p className="mt-2 text-[11.5px] leading-snug text-ink-2">{worker.summary}</p>
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-ink-3">
            <ChevronRight className="mt-px h-3 w-3 shrink-0" style={{ color: role.color }} />
            <span className="min-w-0 break-words">{worker.recentAction}</span>
          </p>

          {worker.activeFiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {worker.activeFiles.map((f) => (
                <span key={f} title={f} className="inline-flex max-w-full items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-ink-2">
                  <FileCode2 className="h-3 w-3 shrink-0 text-azure-hi" />
                  <span className="truncate">{basename(f)}</span>
                </span>
              ))}
            </div>
          )}

          <div className="mt-2.5 flex items-center gap-3 border-t hairline pt-2 font-mono text-[10.5px] tabular-nums text-ink-3">
            <span className="text-ok">+{worker.additions}</span>
            <span className="text-bad">−{worker.deletions}</span>
            <span className="ml-auto">{formatTokens(worker.tokensIn + worker.tokensOut)} tok</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(worker.elapsedMs)}</span>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
