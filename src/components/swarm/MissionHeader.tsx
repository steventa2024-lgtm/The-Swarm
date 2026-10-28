import { FamiliarRoster } from '@/components/agents/FamiliarRoster'
import { DEMO_PROMPT, useSwarm } from '@/store/swarm'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import type { Run } from '@/types'
export function MissionHeader() {
  const [demoError, setDemoError] = useState('')
  const run = useSwarm((s) => s.run), replaying = useSwarm((s) => s.replaying), error = useSwarm((s) => s.recorderError)
  const busy = !replaying && !!run && ['planning', 'running', 'reviewing', 'paused'].includes(run.status)
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-ok">THE SWARM / ENGINEERING WORKSPACE</p><h1 className="mt-1 text-[26px] font-semibold tracking-tight">Mission control<span className="text-ok">.</span></h1><p className="mt-1 text-xs text-ink-3">One brief. A coordinated team. Every change accountable to Zero.</p></div><Button variant="outline" disabled={busy} onClick={() => useSwarm.getState().start({ prompt: DEMO_PROMPT, localDemo: true })}>Run local demo ↗</Button></div>
    <FamiliarRoster />
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ok/20 bg-ok/[.035] px-4 py-2.5 text-xs"><span className="text-ok">◇</span><span className="text-ink-2">{replaying ? 'Recorded state · replay is read-only' : run?.source === 'simulation' ? 'Scripted simulation · no real agents or tool runs' : 'Owner control is active. Agents propose; Zero approves or rejects.'}</span>{run?.status === 'completed' && <button className="ml-auto text-ok" onClick={() => useSwarm.getState().setApplyOpen(true)}>Review proposal ↗</button>}</div>
    <div className="flex items-center gap-3 text-[11px] text-ink-3"><button disabled={busy} className="text-azure-hi hover:underline disabled:opacity-40" onClick={async () => { try { const response = await fetch('/demo-run.json'); if (!response.ok) throw new Error('Run the opt-in local demo test to create this recording.'); const demo: Run = await response.json(); if (demo.source !== 'live' || demo.status !== 'completed' || !Array.isArray(demo.workers)) throw new Error('No verified demo recording is available.'); useSwarm.getState().openRun(demo); setDemoError('') } catch { setDemoError('Demo recording unavailable. Run the opt-in local demo test described in README.') } }}>Open recorded Ollama demo</button><span>Real model output · awaits your review and approval</span></div>
    {demoError && <p role="alert" className="text-xs text-bad">{demoError}</p>}
    {error && <p role="alert" className="text-xs text-bad">{error}</p>}
  </div>
}
