import { motion } from 'framer-motion'
import {
  BookMarked, FolderKanban, LayoutTemplate, LifeBuoy, Plug, Settings, Sparkles, Users, Workflow,
  type LucideIcon,
} from 'lucide-react'
import { budgetLevel, paidTokens, usedLast24h } from '@/lib/budget'
import { cn, formatTokens } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'
import type { PageId } from '@/types'
import { ProgressBar } from '@/components/common/ProgressBar'
import { Tip } from '@/components/ui/tooltip'

const NAV: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'swarm', label: 'Swarm', icon: Workflow },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'agents', label: 'Agents', icon: Users },
  { id: 'knowledge', label: 'Knowledge', icon: BookMarked },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'integrations', label: 'Integrations', icon: Plug },
]
const NAV_BOTTOM: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'support', label: 'Support', icon: LifeBuoy },
]

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: 'linear-gradient(145deg,#0d2a66,#06142f)', boxShadow: '0 0 0 1px rgba(110,170,255,.4), 0 0 22px -4px rgba(59,130,255,.9)' }}
    >
      <svg viewBox="0 0 32 32" width={size * 0.72} height={size * 0.72}>
        <defs>
          <linearGradient id="bm" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9be3ff" />
            <stop offset="1" stopColor="#3b82ff" />
          </linearGradient>
        </defs>
        <path d="M3 17h5l3.2-9 5.2 16 3.4-10 2 3h7" fill="none" stroke="url(#bm)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function NavButton({ item, active, onClick }: { item: { id: PageId; label: string; icon: LucideIcon }; active: boolean; onClick: () => void }) {
  const Icon = item.icon
  return (
    <Tip label={item.label} side="right">
      <button
        onClick={onClick}
        className={cn(
          'group relative flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-colors',
          'max-xl:justify-center max-xl:px-0',
          active ? 'text-white' : 'text-ink-3 hover:bg-white/[0.04] hover:text-ink',
        )}
      >
        {active && (
          <motion.span
            layoutId="nav-active"
            className="absolute inset-0 rounded-xl border border-azure-hi/40 bg-gradient-to-r from-azure/30 via-azure/15 to-transparent shadow-[0_0_26px_-6px_rgba(59,130,255,0.85)]"
            transition={{ type: 'spring', stiffness: 460, damping: 36 }}
          />
        )}
        {active && <span className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-azure-hi shadow-[0_0_12px_2px_rgba(95,162,255,0.9)]" />}
        <Icon className={cn('relative h-[18px] w-[18px] shrink-0 transition-colors', active ? 'text-azure-hi' : 'group-hover:text-azure-hi')} />
        <span className="relative max-xl:hidden">{item.label}</span>
      </button>
    </Tip>
  )
}

export function Sidebar() {
  const page = useApp((s) => s.page)
  const setPage = useApp((s) => s.setPage)
  const history = useApp((s) => s.history)
  const budget = useApp((s) => s.preferences.tokenBudget)
  const mode = useApp((s) => s.preferences.tokenBudgetMode)
  const providers = useApp((s) => s.providers)
  const run = useSwarm((s) => s.run)
  const runIsLive = useSwarm((s) => s.runIsLive)

  // Paid tokens only: local models are free, and simulated runs spend nothing.
  const used = usedLast24h(history) + (runIsLive ? paidTokens(run?.metrics, providers) : 0)
  const { level, pct } = budgetLevel(used, budget, mode)
  const barColor = level === 'over' ? '#f87171' : level === 'warn' ? '#fbbf24' : '#4d9bff'
  const note = mode === 'strict' ? 'Strict: a run that reaches the limit is stopped.' : mode === 'balanced' ? 'Balanced: warns at 80% and 100%.' : 'Budget guard is off.'

  return (
    <aside className="glass relative z-10 flex w-[232px] shrink-0 flex-col border-y-0 border-l-0 px-3 py-4 max-xl:w-[68px] max-xl:px-2">
      <div className="mb-6 flex items-center gap-2.5 px-1 max-xl:justify-center">
        <BrandMark />
        <div className="leading-tight max-xl:hidden">
          <div className="text-[15px] font-semibold tracking-tight text-ink">
            ZeroPulse <span className="text-azure-hi text-glow">Swarm</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink-4">Agent orchestration</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((n) => <NavButton key={n.id} item={n} active={page === n.id} onClick={() => setPage(n.id)} />)}
      </nav>

      <div className="flex-1" />

      <div className="glass mb-3 rounded-2xl p-3 max-xl:hidden">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
            <Sparkles className="h-3.5 w-3.5 text-sky" /> Paid usage
          </span>
          <span className="rounded bg-azure/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-azure-hi">Local</span>
        </div>
        <div className="mt-2.5 flex items-baseline justify-between text-[11px]">
          <span className="text-ink-3">Paid tokens · 24h</span>
          <span className="font-mono text-ink-2">{formatTokens(used)} / {formatTokens(budget)}</span>
        </div>
        <ProgressBar value={Math.min(100, pct)} className="mt-1.5" height={5} color={barColor} />
        <p className="mt-2 text-[10.5px] leading-snug text-ink-4">{note} Local models are free and not counted.</p>
      </div>

      <nav className="flex flex-col gap-1 border-t hairline pt-3">
        {NAV_BOTTOM.map((n) => <NavButton key={n.id} item={n} active={page === n.id} onClick={() => setPage(n.id)} />)}
      </nav>
    </aside>
  )
}
