import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

export function LoadingState({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3 p-4', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="glass rounded-2xl p-4">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="mt-3 h-2.5 w-full" />
          <Skeleton className="mt-2 h-2.5 w-4/5" />
        </div>
      ))}
    </div>
  )
}
