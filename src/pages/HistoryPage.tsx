import { FlightRecorder } from '@/components/swarm/FlightRecorder'
import { PageHeader } from '@/components/common/PageHeader'
import { useApp } from '@/store/app'
export function HistoryPage() {
  const history = useApp((s) => s.history), projects = useApp((s) => s.projects)
  return <div className="h-full space-y-5 overflow-y-auto p-6"><PageHeader title="History & flight recorder" description="Durable local evidence. Historical frames never execute tools or grant approval." /><FlightRecorder /><button className="text-sm text-azure-hi" onClick={() => useApp.getState().setPage('swarm')}>Open the selected historical graph in Mission Control →</button><section className="mission-panel p-5"><h2 className="mb-3 font-semibold">Recorded run outcomes</h2><div className="space-y-3">{history.map((r) => <article key={r.id} className="rounded-xl border hairline p-3 text-xs"><strong>{r.title}</strong><p className="mt-1 text-ink-3">{projects.find((p) => p.id === r.projectId)?.name ?? 'Historical project'} · {r.simulated || /^run-h/.test(r.id) ? 'SIMULATED / legacy sample' : 'Recorded live execution'} · {r.status} · {r.tokens} recorded tokens</p></article>)}</div></section></div>
}
