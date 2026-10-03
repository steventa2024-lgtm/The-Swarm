import { cn } from '@/lib/utils'
import { TONE_COLOR, type Tone } from '@/lib/meta'

export function StatusDot({ tone, live, className }: { tone: Tone; live?: boolean; className?: string }) {
  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', live && 'animate-pulse-dot', className)}
      style={{ background: TONE_COLOR[tone], color: TONE_COLOR[tone], boxShadow: live ? undefined : `0 0 6px ${TONE_COLOR[tone]}66` }}
    />
  )
}

export function StatusBadge({
  tone, label, live, className,
}: { tone: Tone; label: string; live?: boolean; className?: string }) {
  const c = TONE_COLOR[tone]
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium', className)}
      style={{ color: c, borderColor: `${c}40`, background: `${c}14` }}
    >
      <StatusDot tone={tone} live={live} className="h-1.5 w-1.5" />
      {label}
    </span>
  )
}
