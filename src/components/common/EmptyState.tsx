import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon: Icon, title, description, action, className,
}: { icon: LucideIcon; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-10 text-center', className)}>
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-azure/30 blur-xl" />
        <div className="glass relative flex h-12 w-12 items-center justify-center rounded-2xl text-azure-hi">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-xs text-xs text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  )
}
