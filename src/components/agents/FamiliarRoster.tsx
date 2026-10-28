import { lazy, Suspense, useEffect, useState } from 'react'
import { FAMILIARS, mascotState, type FamiliarId, type MascotState } from '@/data/familiars'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'
import { AgentMascot } from './AgentMascot'
import { useFamiliarApproval } from '@/lib/useFamiliarApproval'
import { useFamiliarInteractions } from '@/lib/useFamiliarInteractions'
import { FamiliarRecordingControls } from './FamiliarRecordingControls'
const FamiliarRenderScope = lazy(() => import('./three/SharedFamiliarScene').then((module) => ({ default: module.FamiliarRenderScope })))
const CommandCenterScene = lazy(() => import('./three/CommandCenterScene'))

export function FamiliarRoster() {
  const [selected, setSelected] = useState<FamiliarId | null>(null), [commandCenter, setCommandCenter] = useState(false)
  const providers = useApp((s) => s.providers), agents = useApp((s) => s.agents)
  const run = useSwarm((s) => s.run), replay = useSwarm((s) => s.replaying), actualExecution = useSwarm((s) => s.runIsLive)
  const historical = run?.source === 'live' && (replay || !actualExecution)
  const { approvals, nowMs } = useFamiliarApproval(!replay && run?.source === 'live')
  const interactions = useFamiliarInteractions(run, actualExecution, replay, approvals)
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [selected])
  const states = Object.fromEntries(FAMILIARS.map((f) => [f.id, mascotState(f.id, providers, run, replay, actualExecution, approvals, nowMs)])) as Record<FamiliarId, MascotState>
  const familiar = FAMILIARS.find((f) => f.id === selected), provider = providers.find((p) => p.id === familiar?.provider)
  const workers = run?.source === 'live' ? run.workers.filter((w) => w.providerId === familiar?.provider) : []
  const evidenceWorker = workers.find((w) => w.status === 'working') ?? workers.at(-1)
  return <Suspense fallback={<div className="mission-panel rounded-xl p-4 text-xs text-ink-3">Preparing the 3D team renderer…</div>}><FamiliarRenderScope focused={!!selected}>
    <div className="mb-2 flex items-center justify-between gap-3 text-[10px] text-ink-3"><span>{historical ? 'Historical evidence · no live execution' : 'Living companions · idle movement is personality, not proof of work'}</span><button className="text-azure-hi" onClick={() => setCommandCenter((s) => !s)}>{commandCenter ? 'Return to eight-agent roster' : 'Open 3D command center'}</button></div>
    {commandCenter ? <CommandCenterScene states={states} provenance={historical ? 'history' : run?.source === 'simulation' ? 'simulation' : actualExecution && run ? 'live' : 'idle'} interactions={interactions} active={!selected} onInspect={setSelected} /> : <div className="familiar-roster" aria-label="Eight Hardlight Familiars">{FAMILIARS.map((f) => <button key={f.id} className="familiar-card mission-panel" onClick={() => setSelected(f.id)} style={{ borderColor: `${f.color}40` }}>
      <AgentMascot id={f.id} state={states[f.id]} />
      <div className="px-3 pb-3"><h2 className="text-xs font-semibold" style={{ color: f.color }}>{f.name}</h2><p className="mt-1 truncate text-[10px] text-ink-3">{f.role}</p><p className="mt-2 text-[10px] uppercase tracking-wider text-ink-2">{states[f.id] === 'waiting_approval' ? 'Native approval pending' : historical ? `History · ${states[f.id]}` : states[f.id].replaceAll('_', ' ')}</p><p className="mt-1 text-[9px] text-ink-4">{f.id === 'hq' ? 'Deterministic coordination' : providers.find((p) => p.id === f.provider)?.verified && providers.find((p) => p.id === f.provider)?.status === 'connected' ? 'Provider verified previously' : 'Provider not configured/offline'}</p></div>
    </button>)}</div>}
    <div className="mt-2"><FamiliarRecordingControls /></div>
    {familiar && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => setSelected(null)}><section role="dialog" aria-modal="true" aria-label={`${familiar.name} inspector`} className="glass max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between"><h2 className="text-xl font-semibold" style={{ color: familiar.color }}>{familiar.name}</h2><button autoFocus aria-label="Close agent inspector" onClick={() => setSelected(null)}>✕</button></div>
      {historical && <p className="mt-3 text-xs text-amber-300">Historical evidence · no live execution</p>}
      <div className="mt-4 grid gap-5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"><AgentMascot id={familiar.id} state={states[familiar.id]} portrait /><div className="space-y-3 text-xs">
        <p>{familiar.role}</p><p>Provider: {provider?.name ?? 'No inference provider needed'} · {provider?.status ?? 'Coordination'}</p><p>Telegram health: open Telegram Bots for current getMe and delivery evidence.</p>
        <p>Requested model: {evidenceWorker?.requestedModel ?? evidenceWorker?.modelId ?? agents.find((a) => a.providerId === familiar.provider)?.modelId ?? 'Not selected'}</p><p>Observed model: {evidenceWorker?.observedModel ?? 'Unavailable / CLI does not expose it'}</p><p>Reasoning: {evidenceWorker?.reasoningEffort ?? 'Provider default · unobserved'}</p><p>Remaining allowance unavailable — local estimate only.</p><p>Tools: proposal only. No shell, filesystem writes or MCP granted to CLI inference.</p>
        <button className="text-azure-hi" onClick={() => { setSelected(null); useApp.getState().setPage('models') }}>Model controls & usage →</button>
      </div></div>
      <div className="mt-4 space-y-2">{workers.map((w) => <p key={w.id} className="rounded-lg border hairline p-3 text-xs">{w.role} · {w.recentAction} · {w.tokensIn + w.tokensOut} {w.usageEstimated ? 'estimated' : 'reported'} tokens</p>)}</div>
      <p className="mt-4 text-[10px] text-ink-4">Articulated 3D character · drag to orbit, scroll to zoom. Idle movement is personality only; it is not proof of work. Replay is historical. Zero remains the only final approver.</p>
    </section></div>}
  </FamiliarRenderScope></Suspense>
}
