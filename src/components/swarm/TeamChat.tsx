import { useState } from 'react'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'
import { Button } from '@/components/ui/button'
import { redactText } from '@/lib/redact'
import type { Run } from '@/types'

export function TeamChat({ run }: { run: Run | null }) {
  const [draft, setDraft] = useState(''), [search, setSearch] = useState(''), [agent, setAgent] = useState(''), [count, setCount] = useState(60)
  const styled = useApp((s) => !!s.preferences.personalities)
  const replaying = useSwarm((s) => s.replaying)
  const busy = !replaying && !!run && ['planning', 'running', 'reviewing', 'paused'].includes(run.status)
  const events = run?.source === 'live' ? [...run.events].reverse().filter((e) => (!agent || e.workerId === agent) && e.message.toLowerCase().includes(search.toLowerCase())).slice(0, count) : []
  return <section className="mission-panel flex min-h-0 flex-1 flex-col" aria-label="Team Chat">
    <header className="flex items-center justify-between border-b hairline px-4 py-3"><h2 className="font-semibold">Team Chat</h2><span className="text-[10px] uppercase tracking-widest text-ok">Evidence linked</span></header>
    <div className="space-y-2 border-b hairline p-3"><input aria-label="Search team messages" className="w-full rounded-lg border hairline bg-night p-2 text-xs" placeholder="Search this project’s real messages…" value={search} onChange={(e) => setSearch(e.target.value)} /><select aria-label="Filter agent messages" className="w-full rounded-lg bg-night p-2 text-xs" value={agent} onChange={(e) => setAgent(e.target.value)}><option value="">All agents / current project</option>{run?.workers.map((w) => <option key={w.id} value={w.id}>{w.name} / actual provider: {w.providerId}</option>)}</select>{replaying && <p className="text-[10px] text-amber-300">HISTORICAL REPLAY · no live execution</p>}</div>
    <div className="selectable min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite" aria-relevant="additions">
      {styled && <p className="text-[10px] text-indigo">Personality styling enabled · does not change permissions</p>}
      {!events.length && <div className="py-6"><p className="text-sm text-ink-2">Your team is ready for a brief.</p><p className="mt-2 text-xs leading-relaxed text-ink-3">Messages appear when an agent actually plans, calls a tool, produces an artifact, or reviews work. Connect a provider to begin.</p></div>}
      {events.map((event) => <article key={event.id} className="border-l-2 border-line pl-3">
        <div className="flex gap-2 text-[11px]"><strong className="text-ink-2">{run?.workers.find((w) => w.id === event.workerId)?.providerId ?? 'Orchestrator'}</strong><time className="ml-auto shrink-0 font-mono text-ink-4">+{Math.floor(event.at / 1000)}s</time></div>
        <p className="mt-1 break-words text-xs leading-relaxed text-ink-2">{redactText(event.message, 'strict')}</p>
        <button className="mt-1.5 text-left font-mono text-[10px] text-azure-hi hover:underline" onClick={() => useSwarm.getState().select(event.workerId ?? null)}>{event.toolRunId ? `tool / ${event.toolRunId}` : `task / ${event.taskId ?? run?.task.id}`}</button>
        {event.artifactPath && <p className="mt-1 break-all font-mono text-[10px] text-ok">artifact / {event.artifactPath}</p>}
      </article>)}
      {events.length >= count && <button className="text-xs text-azure-hi" onClick={() => setCount(count + 60)}>Load earlier messages</button>}
    </div>
    <form className="border-t hairline p-3" onSubmit={(e) => { e.preventDefault(); if (draft.trim() && !busy) { useSwarm.getState().start({ prompt: draft }); setDraft('') } }}>
      <label htmlFor="team-task" className="mb-1 block text-[10px] text-ink-3">Zero → new engineering task</label>
      <div className="flex gap-2"><input id="team-task" className="min-w-0 flex-1 rounded-lg border hairline bg-night px-3 py-2 text-xs" placeholder={busy ? 'Run in progress' : 'Give the team a task…'} value={draft} disabled={busy} onChange={(e) => setDraft(e.target.value)} /><Button type="submit" variant="primary" size="sm" disabled={busy || !draft.trim()}>Send</Button></div>
    </form>
  </section>
}
