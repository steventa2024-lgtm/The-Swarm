import { Activity, Coins, Gauge, HeartPulse, Layers } from 'lucide-react'
import { useMemo } from 'react'
import { DonutChart } from '@/components/common/DonutChart'
import { MetricCard } from '@/components/common/MetricCard'
import { ProgressBar } from '@/components/common/ProgressBar'
import { Sparkline } from '@/components/common/Sparkline'
import { paidTokens } from '@/lib/budget'
import { formatCost, formatDuration, formatTokens, timeAgo } from '@/lib/utils'
import { useApp } from '@/store/app'
import type { Run } from '@/types'

const PROVIDER_COLORS = ['#3b82ff', '#22d3ee', '#7dd3fc', '#7b8cff', '#2dd4bf']

export function MetricsRow({ run }: { run: Run | null }) {
  const providers = useApp((s) => s.providers)
  const history = useApp((s) => s.history)
  const budget = useApp((s) => s.preferences.tokenBudget)
  const m = run?.metrics
  const total = m ? m.tokensIn + m.tokensOut : 0
  const paid = paidTokens(m, providers)

  const slices = useMemo(
    () =>
      (m?.byProvider ?? []).map((u, i) => ({
        label: providers.find((p) => p.id === u.providerId)?.name ?? u.providerId,
        value: u.tokens,
        color: PROVIDER_COLORS[i % PROVIDER_COLORS.length],
      })),
    [m?.byProvider, providers],
  )

  const recent = history.slice(0, 8)
  const okRate = recent.length ? Math.round((recent.filter((h) => h.status === 'completed').length / recent.length) * 100) : 100
  const inShare = total ? (m!.tokensIn / total) * 100 : 50

  return (
    <div className="grid grid-cols-[1fr_1fr_1.45fr_1fr_1fr] gap-3 max-xl:grid-cols-3 max-lg:grid-cols-2 max-xl:[&>*:nth-child(n+4)]:hidden">
      <MetricCard
        label="Total tokens" icon={Layers} value={formatTokens(total)} series={m?.tokenSeries ?? [0, 0]}
        footer={
          <div>
            <div className="flex justify-between font-mono text-[10.5px] text-ink-3">
              <span>In {formatTokens(m?.tokensIn ?? 0)}</span><span>Out {formatTokens(m?.tokensOut ?? 0)}</span>
            </div>
            <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full bg-azure transition-[width] duration-300" style={{ width: `${inShare}%` }} />
              <div className="h-full bg-cyan transition-[width] duration-300" style={{ width: `${100 - inShare}%` }} />
            </div>
          </div>
        }
      />

      <MetricCard
        label="Estimated cost" icon={Coins} color="#7dd3fc" value={formatCost(m?.costUsd ?? 0)}
        footer={
          <div>
            <Sparkline data={m?.costSeries ?? [0, 0]} color="#7dd3fc" height={26} />
            <div className="mt-1.5 flex justify-between text-[10.5px] text-ink-3">
              <span>Paid-token budget (this run)</span><span className="font-mono">{Math.min(100, Math.round((paid / budget) * 100))}%</span>
            </div>
            <ProgressBar value={(paid / budget) * 100} color="#7dd3fc" className="mt-1" height={3} />
          </div>
        }
      />

      <div className="glass glass-hover min-w-0 rounded-2xl p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Provider routing</span>
          <Activity className="h-3.5 w-3.5 text-azure-hi" />
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <DonutChart
            size={86} thickness={10} slices={slices}
            center={<><span className="font-mono text-[13px] font-semibold text-ink">{slices.length}</span><span className="text-[9px] uppercase tracking-wider text-ink-3">routes</span></>}
          />
          <ul className="min-w-0 flex-1 space-y-1">
            {slices.length === 0 && <li className="text-[11px] text-ink-4">No traffic yet</li>}
            {slices.slice(0, 4).map((s) => (
              <li key={s.label} className="flex items-center gap-1.5 text-[11px]">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate text-ink-2">{s.label}</span>
                <span className="font-mono tabular-nums text-ink-3">{Math.round((s.value / Math.max(1, total)) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <MetricCard
        label="Throughput" icon={Gauge} color="#22d3ee" value={formatTokens(m?.throughput ?? 0)} unit="tok/s"
        series={m?.throughputSeries ?? [0, 0]}
        footer={undefined}
      />

      <div className="glass glass-hover min-w-0 rounded-2xl p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Run health</span>
          <HeartPulse className="h-3.5 w-3.5 text-ok" />
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="font-mono text-[22px] font-semibold leading-none text-ink">{okRate}</span>
          <span className="text-[11px] text-ink-3">% success</span>
        </div>
        <div className="mt-2.5 flex gap-1">
          {recent.map((h) => (
            <span
              key={h.id} title={`${h.title} · ${timeAgo(h.startedAt)}`}
              className="h-5 flex-1 rounded-sm"
              style={{ background: h.status === 'completed' ? 'rgba(45,212,191,.75)' : h.status === 'failed' ? 'rgba(248,113,113,.8)' : 'rgba(125,143,179,.5)' }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10.5px] text-ink-3">
          <span>Last {recent.length} runs</span>
          <span className="font-mono">Runtime {formatDuration(run?.elapsedMs ?? 0)}</span>
        </div>
      </div>
    </div>
  )
}
