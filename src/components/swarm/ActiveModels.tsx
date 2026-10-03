import { Cpu } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { ProviderTag } from '@/components/common/ProviderTag'
import { ROLE_META } from '@/lib/meta'
import { formatTokens } from '@/lib/utils'
import type { Worker } from '@/types'

export function ActiveModels({ workers }: { workers: Worker[] }) {
  if (workers.length === 0) {
    return <EmptyState icon={Cpu} title="No models assigned" description="Models are routed per worker when a run starts." className="py-6" />
  }
  const groups = new Map<string, { providerId: string; label: string; workers: Worker[] }>()
  for (const w of workers) {
    const k = `${w.providerId}/${w.modelId}`
    const g = groups.get(k) ?? { providerId: w.providerId, label: w.modelLabel, workers: [] }
    g.workers.push(w)
    groups.set(k, g)
  }
  return (
    <ul className="space-y-1.5">
      {[...groups.values()].map((g) => (
        <li key={g.label} className="rounded-xl border hairline bg-white/[0.02] p-2">
          <div className="flex items-center justify-between">
            <ProviderTag providerId={g.providerId} label={g.label} />
            <span className="font-mono text-[10.5px] text-ink-3">
              {formatTokens(g.workers.reduce((s, w) => s + w.tokensIn + w.tokensOut, 0))} tok
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {g.workers.map((w) => (
              <span key={w.id} className="rounded px-1.5 py-px text-[10px]" style={{ background: `${ROLE_META[w.role].color}1f`, color: ROLE_META[w.role].color }}>
                {ROLE_META[w.role].short}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}
