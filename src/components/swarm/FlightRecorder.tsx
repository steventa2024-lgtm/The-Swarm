import { useEffect, useState } from 'react'
import { listFlights, loadFlight, type FlightRecord } from '@/persistence/flightRecorder'
import { useSwarm } from '@/store/swarm'
import { Button } from '@/components/ui/button'
export function FlightRecorder() {
  const [ids, setIds] = useState<string[]>([]), [record, setRecord] = useState<FlightRecord | null>(null), [index, setIndex] = useState(0), [error, setError] = useState('')
  useEffect(() => { void listFlights().then(setIds).catch(() => setError('Could not read the recorder.')) }, [])
  const current = record?.frames[index]
  const show = (i: number) => {
    if (!record) return
    if (!useSwarm.getState().openRun(record.frames[i], true)) { setError('Finish or stop the active run before replay.'); return }
    setIndex(i); setError('')
  }
  return <section className="mission-panel space-y-4 p-4" aria-label="Session flight recorder">
    <div><h2 className="font-semibold">Session flight recorder</h2><p className="mt-1 text-xs leading-relaxed text-ink-3">Rewind recorded state. Replay never executes a tool or grants approval.</p></div>
    <label className="block text-xs text-ink-3">Session<select className="mt-2 w-full rounded-lg border hairline bg-night p-2" value={record?.id ?? ''} onChange={async (e) => { setRecord(await loadFlight(e.target.value)); setIndex(0) }}><option value="">Choose a recording</option>{ids.map((id) => <option key={id}>{id}</option>)}</select></label>
    {!ids.length && <p className="text-xs text-ink-3">No recorded live sessions yet.</p>}
    {record && <><input aria-label="Replay position" className="w-full accent-emerald-300" type="range" min={0} max={record.frames.length - 1} value={index} onChange={(e) => show(Number(e.target.value))} /><p className="text-xs">Frame {index + 1} / {record.frames.length} · {current?.status}</p><Button size="sm" variant="outline" onClick={() => show(index)}>View frame</Button></>}
    {current && <><p className="text-xs text-ink-3">{current.workers.filter((w) => w.status === 'done').length} agents finished · {current.metrics.tokensIn + current.metrics.tokensOut} tokens. CLI subscription costs and remaining quotas may be unavailable.</p><Button size="sm" variant="outline" onClick={() => useSwarm.getState().prepareFix(`Resume this task with a fresh plan and review. Do not apply anything.\n\n${current.task.prompt}\n\nRecovered progress:\n${current.workers.map((w) => `${w.name}: ${w.status} — ${w.summary}`).join('\n')}`)}>Prepare recovery task</Button></>}
    {error && <p role="alert" className="text-xs text-bad">{error}</p>}
  </section>
}
