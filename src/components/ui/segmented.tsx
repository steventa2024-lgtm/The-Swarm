import { motion } from 'framer-motion'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Option<T extends string | number> { value: T; label: ReactNode; title?: string }

export function Segmented<T extends string | number>({
  value, onChange, options, className, size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: Option<T>[]
  className?: string
  size?: 'sm' | 'md'
}) {
  const id = useId()
  return (
    <div className={cn('relative inline-flex rounded-lg border border-line bg-night/60 p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative z-10 rounded-md font-medium transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]',
              active ? 'text-white' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 -z-10 rounded-md border border-azure-hi/40 bg-azure/30 shadow-[0_0_16px_-4px_rgba(59,130,255,0.9)]"
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              />
            )}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
