import { motion } from 'framer-motion'
import { Check, CheckCircle2, Circle, Flag, Loader2, MessageSquareText } from 'lucide-react'
import type { ReactNode } from 'react'
import { MODE_META, ROLE_META, WORKER_STATUS_META } from '@/lib/meta'
import { basename, cn, formatCost, formatTokens } from '@/lib/utils'
import { ProgressBar } from '@/components/common/ProgressBar'
import { ProviderTag } from '@/components/common/ProviderTag'
import { StatusBadge } from '@/components/common/StatusBadge'
import { Button } from '@/components/ui/button'
import type { Run, Worker } from '@/types'

interface ShellProps {
  id: string
  live?: boolean
  done?: boolean
  ghost?: boolean
  selected?: boolean
  onClick?: () => void
  className?: string
  children: ReactNode
  delay?: number
}

/** Common glass node frame. `data-node` is how edges find it. */
export function NodeShell({ id, live, done, ghost, selected, onClick, className, children, delay = 0 }: ShellProps) {
  return (
    <motion.div
      data-node={id}
      initial={{ opacity: 0 }}
      animate={{ opacity: ghost ? 0.4 : 1 }}
      transition={{ duration: 0.45, delay }}
      onClick={onClick}
      className={cn(
        'glass relative rounded-2xl p-3 transition-[border-color,box-shadow] duration-300',
        onClick && 'cursor-pointer hover:border-line-hi',
        live && 'glass-active node-live',
        selected && !live && 'border-azure-hi/60 shadow-[0_0_26px_-8px_rgba(59,130,255,0.7)]',
        ghost && 'border-dashed',
        className,
      )}
    >
      {done && (
        <motion.span
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-ok text-void shadow-[0_0_14px_rgba(45,212,191,0.8)]"
        >
          <Check className="h-3 w-3" strokeWidth={3.5} />
        </motion.span>
      )}
      {children}
    </motion.div>
  )
}

function RoleIcon({ role, live }: { role: Worker['role']; live?: boolean }) {
  const m = ROLE_META[role]
  const Icon = m.icon
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
      style={{ background: `${m.color}1f`, color: m.color, boxShadow: live ? `0 0 16px -2px ${m.color}aa` : `inset 0 0 0 1px ${m.color}33` }}
    >
      <Icon className="h-4 w-4" />
    </span>
  )
}

export function Checklist({ items, columns = 1 }: { items: Worker['checklist']; columns?: 1 | 2 }) {
  return (
    <ul className={cn('grid gap-x-3 gap-y-1', columns === 2 && 'grid-cols-2')}>
      {items.map((c, i) => {
        const active = !c.done && items.slice(0, i).every((x) => x.done)
        return (
          <li key={c.id} className={cn('flex items-center gap-1.5 text-[11px] leading-tight', c.done ? 'text-ink-2' : active ? 'text-ink' : 'text-ink-4')}>
            {c.done ? <CheckCircle2 className="h-3 w-3 shrink-0 text-ok" /> : active ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-azure-hi" /> : <Circle className="h-3 w-3 shrink-0" />}
            <span className="truncate">{c.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function TaskNode({ run, ghost }: { run: Run | null; ghost?: boolean }) {
  const t = run?.task
  return (
    <NodeShell id="task" ghost={ghost} done={!!run} className="w-[360px] max-w-full">
      <div className="flex items-start gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky/15 text-sky shadow-[inset_0_0_0_1px_rgba(125,211,252,0.3)]">
          <MessageSquareText className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky">User task</span>
            {t && (
              <span className="flex gap-1">
                <span className="rounded bg-white/[0.06] px-1.5 py-px text-[10px] text-ink-2">{MODE_META[t.mode].label}</span>
                <span className="rounded bg-white/[0.06] px-1.5 py-px text-[10px] capitalize text-ink-2">{t.complexity}</span>
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[13px] font-medium text-ink">{t ? t.title : 'Waiting for a task'}</p>
          <p className="truncate text-[11px] text-ink-3">{t ? `${t.attachments.length} attachments · ${t.requestedAgents === 'auto' ? 'auto' : t.requestedAgents} agents` : 'Your request enters here'}</p>
        </div>
      </div>
    </NodeShell>
  )
}

/** Planner / Reviewer — wide, compact. */
export function StageNode({ worker, ghost, label, selected, onSelect }: { worker?: Worker; ghost?: boolean; label: string; selected?: boolean; onSelect?: () => void }) {
  const role = worker?.role ?? (label === 'Planner' ? 'planner' : 'reviewer')
  const meta = WORKER_STATUS_META[worker?.status ?? 'idle']
  const live = worker?.status === 'working'
  return (
    <NodeShell id={label.toLowerCase()} ghost={ghost} live={live} done={worker?.status === 'done'} selected={selected} onClick={onSelect} className="w-[360px] max-w-full">
      <div className="flex items-center gap-2.5">
        <RoleIcon role={role} live={live} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-ink">{label}</span>
            <StatusBadge tone={meta.tone} label={meta.label} live={meta.live} />
          </div>
          <p className="truncate text-[11px] text-ink-3">{worker ? worker.recentAction : ROLE_META[role].label}</p>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-[1fr_auto] items-end gap-x-3 gap-y-2">
        {worker ? <Checklist items={worker.checklist} columns={2} /> : <div className="h-8" />}
        <div className="flex flex-col items-end gap-1.5">
          {worker && <ProviderTag providerId={worker.providerId} label={worker.modelLabel} compact />}
          <span className="font-mono text-[13px] font-semibold tabular-nums text-ink">{Math.round(worker?.progress ?? 0)}%</span>
        </div>
      </div>
      <ProgressBar value={worker?.progress ?? 0} color={ROLE_META[role].color} className="mt-2" live={live} />
    </NodeShell>
  )
}

export function WorkerNode({ worker, index, ghost, selected, onSelect }: { worker?: Worker; index: number; ghost?: boolean; selected?: boolean; onSelect?: () => void }) {
  const role = worker?.role ?? 'backend'
  const meta = WORKER_STATUS_META[worker?.status ?? 'idle']
  const m = ROLE_META[role]
  const live = worker?.status === 'working'
  return (
    <NodeShell
      id={worker ? `w:${worker.id}` : `ghost:${index}`}
      ghost={ghost} live={live} done={worker?.status === 'done'} selected={selected} onClick={onSelect}
      delay={0.08 * index}
      className="flex min-w-0 flex-1 basis-0 flex-col"
    >
      <div className="flex items-center gap-2">
        <RoleIcon role={role} live={live} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-ink">{ghost ? `Worker ${index + 1}` : m.short}</p>
          <p className="truncate text-[10.5px] text-ink-3">{meta.label}</p>
        </div>
        <span className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: m.color }}>{Math.round(worker?.progress ?? 0)}%</span>
      </div>
      <p className="mt-2 line-clamp-2 min-h-[30px] text-[11px] leading-snug text-ink-2">{worker?.summary ?? 'Assigned when the plan is ready'}</p>
      {worker && <div className="mt-2"><ProviderTag providerId={worker.providerId} label={worker.modelLabel} compact /></div>}
      <div className="mt-2.5 flex-1">
        {worker ? <Checklist items={worker.checklist} /> : <div className="h-14" />}
      </div>
      <ProgressBar value={worker?.progress ?? 0} color={m.color} className="mt-2.5" live={live} />
      <p className="mt-1.5 h-[14px] truncate font-mono text-[10px] text-ink-4">
        {worker?.activeFiles[0] ? basename(worker.activeFiles[0]) : worker?.status === 'done' ? `+${worker.additions} −${worker.deletions}` : '—'}
      </p>
    </NodeShell>
  )
}

export function FinalNode({ run, ghost, onOpen }: { run: Run | null; ghost?: boolean; onOpen?: () => void }) {
  const done = run?.status === 'completed'
  const out = run?.finalOutput
  return (
    <NodeShell id="final" ghost={ghost} done={done} live={false} className="w-[300px] max-w-full" selected={done}>
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', done ? 'bg-ok/15 text-ok shadow-[inset_0_0_0_1px_rgba(45,212,191,0.4)]' : 'bg-white/5 text-ink-3')}>
          <Flag className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">Final output</p>
          <p className="truncate text-[11px] text-ink-3">
            {out ? `${out.filesChanged} files · +${out.additions} −${out.deletions}` : run?.status === 'stopped' ? 'Run stopped' : 'Awaiting review'}
          </p>
        </div>
        {done && <Button variant="primary" size="sm" onClick={onOpen}>View</Button>}
      </div>
      {run && (
        <p className="mt-2 text-[11px] text-ink-3">
          {formatTokens(run.metrics.tokensIn + run.metrics.tokensOut)} tokens · {formatCost(run.metrics.costUsd)}
        </p>
      )}
    </NodeShell>
  )
}
