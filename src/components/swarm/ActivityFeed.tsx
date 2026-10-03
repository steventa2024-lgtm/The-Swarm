import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, CheckCircle2, Code2, FlaskConical, Info, ListTree, ScanSearch, Terminal,
  type LucideIcon,
} from 'lucide-react'
import { Activity } from 'lucide-react'
import { ROLE_META } from '@/lib/meta'
import { formatDuration } from '@/lib/utils'
import { EmptyState } from '@/components/common/EmptyState'
import type { ActivityEvent, ActivityKind } from '@/types'

const KIND: Record<ActivityKind, { icon: LucideIcon; color: string }> = {
  system: { icon: Terminal, color: '#7d8fb3' },
  plan: { icon: ListTree, color: '#7aa8ff' },
  code: { icon: Code2, color: '#4d9bff' },
  review: { icon: ScanSearch, color: '#8aa4ff' },
  test: { icon: FlaskConical, color: '#2dd4bf' },
  info: { icon: Info, color: '#7dd3fc' },
  success: { icon: CheckCircle2, color: '#2dd4bf' },
  warning: { icon: AlertTriangle, color: '#fbbf24' },
}

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return <EmptyState icon={Activity} title="No activity yet" description="Worker actions appear here as the swarm runs." className="py-6" />
  }
  return (
    <ul className="space-y-0.5">
      <AnimatePresence initial={false}>
        {events.slice(0, 40).map((e) => {
          const k = KIND[e.kind]
          const Icon = k.icon
          const role = e.role ? ROLE_META[e.role] : null
          return (
            <motion.li
              key={e.id} layout="position"
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}
              className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.03]"
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: k.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] leading-snug text-ink-2">{e.message}</p>
                {role && <p className="text-[10px]" style={{ color: role.color }}>{role.short}</p>}
              </div>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-4">{formatDuration(e.at)}</span>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}
