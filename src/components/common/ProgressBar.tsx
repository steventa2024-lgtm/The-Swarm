import { cn } from '@/lib/utils'

export function ProgressBar({
  value, color = '#4d9bff', className, height = 4, live,
}: { value: number; color?: string; className?: string; height?: number; live?: boolean }) {
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-white/[0.06]', className)} style={{ height }}>
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-linear"
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          boxShadow: live ? `0 0 10px ${color}` : undefined,
        }}
      />
    </div>
  )
}
