import { Bot } from 'lucide-react'
import { useEffect, useState } from 'react'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'
import { useSwarm } from '@/store/swarm'
import type { Run } from '@/types'
import { ActiveModels } from './ActiveModels'
import { ActivityFeed } from './ActivityFeed'
import { WorkerCard } from './WorkerCard'
import { WorkspaceChanges } from './WorkspaceChanges'

type Tab = 'activity' | 'changes' | 'models'

export function WorkersRail({ run, loading }: { run: Run | null; loading: boolean }) {
  const [tab, setTab] = useState<Tab>('activity')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const selectedId = useSwarm((s) => s.selectedId)
  const select = useSwarm((s) => s.select)

  // Selecting a node in the graph focuses its card.
  useEffect(() => {
    if (selectedId) {
      setOpen((o) => ({ ...o, [selectedId]: true }))
      document.getElementById(`wc-${selectedId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedId])

  const activeCount = run?.workers.filter((w) => w.status === 'working').length ?? 0

  return (
    <aside className="flex h-full w-[348px] shrink-0 flex-col gap-3 max-xl:w-[300px]">
      <section className="glass flex min-h-0 flex-[1.25] flex-col rounded-2xl">
        <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">AI Workers</h2>
          <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-medium', activeCount ? 'bg-azure/20 text-azure-hi' : 'bg-white/5 text-ink-3')}>
            {activeCount} active
          </span>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
          {loading ? (
            <LoadingState rows={3} className="p-0" />
          ) : !run ? (
            <EmptyState icon={Bot} title="No workers yet" description="Workers spin up as soon as the planner finishes." />
          ) : (
            run.workers.map((w) => {
              const auto = w.status === 'working' || w.status === 'paused' || w.status === 'error'
              const expanded = open[w.id] ?? auto
              return (
                <div id={`wc-${w.id}`} key={w.id}>
                  <WorkerCard
                    worker={w} expanded={expanded} selected={selectedId === w.id}
                    onToggle={() => { setOpen((o) => ({ ...o, [w.id]: !expanded })); select(expanded ? null : w.id) }}
                  />
                </div>
              )
            })
          )}
        </div>
      </section>

      <section className="glass flex min-h-0 flex-1 flex-col rounded-2xl">
        <div className="flex items-center justify-between px-3 pt-3">
          <Segmented
            size="sm" value={tab} onChange={setTab}
            options={[
              { value: 'activity', label: 'Activity' },
              { value: 'changes', label: `Changes${run?.fileChanges.length ? ` · ${run.fileChanges.length}` : ''}` },
              { value: 'models', label: 'Models' },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 pt-2">
          {tab === 'activity' && <ActivityFeed events={run?.events ?? []} />}
          {tab === 'changes' && <WorkspaceChanges files={run?.fileChanges ?? []} />}
          {tab === 'models' && <ActiveModels workers={run?.workers ?? []} />}
        </div>
      </section>
    </aside>
  )
}
