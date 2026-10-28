import { TEAM } from '@/data/team'
import { useApp } from '@/store/app'
import { DEMO_PROMPT, useSwarm } from '@/store/swarm'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import type { Run } from '@/types'
export function MissionHeader() {
  const [demoError, setDemoError] = useState('')
  const providers = useApp((s) => s.providers), run = useSwarm((s) => s.run), replaying = useSwarm((s) => s.replaying), error = useSwarm((s) => s.recorderError)
  const busy = !replaying && !!run && ['planning', 'running', 'reviewing', 'paused'].includes(run.status)
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-ok">THE SWARM / ENGINEERING WORKSPACE</p><h1 className="mt-1 text-[26px] font-semibold tracking-tight">Mission control<span className="text-ok">.</span></h1><p className="mt-1 text-xs text-ink-3">One brief. A coordinated team. Every change accountable to Zero.</p></div><Button variant="outline" disabled={busy} onClick={() => useSwarm.getState().start({ prompt: DEMO_PROMPT, localDemo: true })}>Run local demo ↗</Button></div>
    <div className="grid grid-cols-7 gap-2 max-lg:grid-cols-4">
      <div className="mission-panel p-3"><div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-ok/15 text-xs font-semibold text-ok">Z</div><p className="text-xs font-semibold">Zero</p><p className="mt-1 text-[10px] text-ink-3">Founder & final authority</p><p className="mt-3 text-[10px] text-ok">Owner approval</p></div>
      {TEAM.map((member) => { const provider = providers.find((p) => p.id === member.id); const ready = provider?.verified && provider.status === 'connected'; const working = run?.source === 'live' && run.workers.some((w) => w.providerId === member.id && w.status === 'working'); return <button key={member.id} onClick={() => useApp.getState().setPage('integrations')} className="mission-panel p-3 text-left hover:border-line-hi" title={member.setup}><div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-xs font-semibold" style={{ color: member.color }}>{member.name.slice(0, 2).toUpperCase()}</div><p className="truncate text-xs font-semibold">{member.name}</p><p className="mt-1 min-h-7 text-[10px] text-ink-3">{member.title}</p><p className={`mt-2 text-[10px] ${working ? 'text-ok' : 'text-ink-3'}`}>{working ? 'Working' : ready ? 'Ready' : member.id === 'grok' ? 'Manual research' : 'Setup needed'}</p></button> })}
    </div>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ok/20 bg-ok/[.035] px-4 py-2.5 text-xs"><span className="text-ok">◇</span><span className="text-ink-2">{replaying ? 'Recorded state · replay is read-only' : run?.source === 'simulation' ? 'Scripted simulation · no real agents or tool runs' : 'Owner control is active. Agents propose; Zero approves or rejects.'}</span>{run?.status === 'completed' && <button className="ml-auto text-ok" onClick={() => useSwarm.getState().setApplyOpen(true)}>Review proposal ↗</button>}</div>
    <div className="flex items-center gap-3 text-[11px] text-ink-3"><button disabled={busy} className="text-azure-hi hover:underline disabled:opacity-40" onClick={async () => { try { const response = await fetch('/demo-run.json'); if (!response.ok) throw new Error('Run the opt-in local demo test to create this recording.'); const demo: Run = await response.json(); if (demo.source !== 'live' || demo.status !== 'completed' || !Array.isArray(demo.workers)) throw new Error('No verified demo recording is available.'); useSwarm.getState().openRun(demo); setDemoError('') } catch { setDemoError('Demo recording unavailable. Run the opt-in local demo test described in README.') } }}>Open recorded Ollama demo</button><span>Real model output · awaits your review and approval</span></div>
    {demoError && <p role="alert" className="text-xs text-bad">{demoError}</p>}
    {error && <p role="alert" className="text-xs text-bad">{error}</p>}
  </div>
}
