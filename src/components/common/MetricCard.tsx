import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Sparkline } from './Sparkline'

export function MetricCard({
  label, value, unit, delta, icon: Icon, series, color = '#4d9bff', footer, className,
}: {
  label: string
  value: ReactNode
  unit?: string
  delta?: string
  icon?: LucideIcon
  series?: number[]
  color?: string
  footer?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('glass glass-hover flex min-w-0 flex-col justify-between rounded-2xl p-3.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-medium uppercase tracking-wider text-ink-3">{label}</span>
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-mono text-[22px] font-semibold leading-none tracking-tight text-ink tabular-nums">{value}</span>
        {unit && <span className="text-[11px] text-ink-3">{unit}</span>}
        {delta && <span className="ml-auto text-[11px] font-medium text-ok">{delta}</span>}
      </div>
      {series ? <div className="mt-2"><Sparkline data={series} color={color} height={34} /></div> : footer && <div className="mt-2">{footer}</div>}
    </div>
  )
}
