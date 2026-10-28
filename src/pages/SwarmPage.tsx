import { useState } from 'react'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'
import { ApplyDialog } from '@/components/swarm/ApplyDialog'
import { FinalOutputModal } from '@/components/swarm/FinalOutputModal'
import { MetricsRow } from '@/components/swarm/MetricsRow'
import { TaskInput } from '@/components/swarm/TaskInput'
import { TimelineView } from '@/components/swarm/TimelineView'
import { WorkersRail } from '@/components/swarm/WorkersRail'
import { PreviewPane } from '@/components/swarm/PreviewPane'
import { OrchestrationGraph } from '@/components/swarm/graph/OrchestrationGraph'
import { MissionHeader } from '@/components/swarm/MissionHeader'
import { TeamChat } from '@/components/swarm/TeamChat'
import { FlightRecorder } from '@/components/swarm/FlightRecorder'

export function SwarmPage({ booting }: { booting: boolean }) {
  const run = useSwarm((s) => s.run)
  const view = useApp((s) => s.view)
  const [showFinal, setShowFinal] = useState(false)
  const [panel, setPanel] = useState<'chat' | 'workers' | 'recorder'>('chat')

  return (
    <div className="flex h-full min-h-0 gap-4 p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Input + graph scroll; analytics stay pinned underneath. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <MissionHeader />
          <TaskInput />
          <section className="glass relative flex-1 rounded-2xl p-4">
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_60%_50%_at_50%_30%,rgba(59,130,255,0.10),transparent_70%)]" />
            <div className="relative">
              {view === 'graph' ? (
                <OrchestrationGraph run={run} loading={booting} onOpenFinal={() => setShowFinal(true)} />
              ) : view === 'timeline' ? (
                <TimelineView run={run} />
              ) : (
                <PreviewPane run={run} />
              )}
            </div>
          </section>
        </div>
        <MetricsRow run={run} />
      </div>
      <aside className="flex w-[330px] shrink-0 flex-col gap-3 max-lg:w-[280px]">
        <div className="flex gap-1 rounded-xl border hairline p-1" aria-label="Team panels">{(['chat', 'workers', 'recorder'] as const).map((tab) => <button key={tab} aria-pressed={panel === tab} onClick={() => setPanel(tab)} className={`flex-1 rounded-lg px-2 py-2 text-xs capitalize ${panel === tab ? 'bg-white/10 text-ink' : 'text-ink-3'}`}>{tab === 'chat' ? 'Team Chat' : tab === 'recorder' ? 'Recorder' : 'Workers'}</button>)}</div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{panel === 'chat' ? <TeamChat run={run} /> : panel === 'recorder' ? <FlightRecorder /> : <WorkersRail run={run} loading={booting} />}</div>
      </aside>
      <ApplyDialog />
      <FinalOutputModal run={run} open={showFinal} onClose={() => setShowFinal(false)} />
    </div>
  )
}
