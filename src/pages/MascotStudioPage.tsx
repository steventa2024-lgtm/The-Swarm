import { lazy, Suspense, useEffect, useState } from 'react'
import { FAMILIARS, MASCOT_STATES, type FamiliarId, type MascotState } from '@/data/familiars'
import { useApp } from '@/store/app'
import { PageHeader } from '@/components/common/PageHeader'
import { Select } from '@/components/ui/fields'
import { FamiliarRecordingControls } from '@/components/agents/FamiliarRecordingControls'
import type { CameraView, RenderMetrics, VisualQuality } from '@/components/agents/three/FamiliarStage'

const FamiliarStage = lazy(() => import('@/components/agents/three/FamiliarStage'))
const CommandCenterScene = lazy(() => import('@/components/agents/three/CommandCenterScene'))
const EXPRESSIONS: Record<MascotState, string> = {
  idle: 'Breathing, blinking, small ear flicks, relaxed gaze and tail movement.',
  thinking: 'A thoughtful head tilt, focused gaze and measured ear movement.',
  working: 'An engaged stance, active paws and energetic tail response.',
  reviewing: 'An inspecting head sweep and attentive expression.',
  waiting_approval: 'An alert, expectant posture. Movement never grants authority.',
  completed: 'A positive acknowledgment with raised ears and a happy tail.',
  failed: 'A lowered head and concerned ears, without exaggerated distress.',
  offline: 'Inactive pose with reduced effects. No autonomous movement.',
}

export function MascotStudioPage() {
  const [state, setState] = useState<MascotState>('idle'), [view, setView] = useState<CameraView>('three-quarter')
  const [selected, setSelected] = useState<FamiliarId>('codex')
  const [teamPreview, setTeamPreview] = useState(false), [cameraVersion, setCameraVersion] = useState(0)
  const [metrics, setMetrics] = useState<RenderMetrics | null>(null), [cycling, setCycling] = useState(false), [paused, setPaused] = useState(false)
  const preferences = useApp((s) => s.preferences)
  const motion = preferences.mascotMotion === 'cinematic' ? 'full' : preferences.mascotMotion ?? 'subtle'
  const quality = preferences.mascotQuality ?? 'medium'
  const familiar = FAMILIARS.find((f) => f.id === selected)!
  useEffect(() => { if (!cycling) return; const timer = window.setInterval(() => setState((s) => MASCOT_STATES[(MASCOT_STATES.indexOf(s) + 1) % MASCOT_STATES.length]), 3600); return () => window.clearInterval(timer) }, [cycling])
  return <div className="h-full space-y-5 overflow-y-auto p-6">
    <PageHeader title="Hardlight Familiars" description="Living 3D prototypes. All state demonstrations on this page are PREVIEWS, independent of agent execution." />
    <button className="familiar-cycle-button" aria-pressed={teamPreview} onClick={() => { setTeamPreview((v) => !v); setMetrics(null) }}>{teamPreview ? 'Return to character view' : 'All eight · team preview'}</button>
    <div className="familiar-stage-heading"><div><span className="familiar-eyebrow">{familiar.name.toUpperCase()} / {familiar.animal.toUpperCase()}</span><h2>A mind with a presence.</h2><p>Modeled volume. Articulated joints. A real perspective camera.</p></div><span className="familiar-preview-badge">PREVIEW · No tools or AI calls</span></div>
    <div className="familiar-studio-layout">
      <section className="familiar-stage-shell" aria-label="Articulated character prototype">
        <Suspense fallback={<div className="familiar-3d-fallback">Loading the local 3D renderer…</div>}>{teamPreview ? <CommandCenterScene states={Object.fromEntries(FAMILIARS.map((f) => [f.id, state])) as Record<FamiliarId, MascotState>} preview paused={paused} onInspect={(id) => { setSelected(id); setTeamPreview(false); setView('three-quarter') }} /> : <FamiliarStage key={selected} id={selected} state={state} preview view={view} cameraVersion={cameraVersion} motion={paused ? 'off' : motion} quality={quality} reducedMotion={preferences.reduceMotion} onMetrics={setMetrics} />}</Suspense>
        <div className="familiar-camera-buttons" aria-label="Camera views">{!teamPreview && (['three-quarter', 'front', 'side', 'rear'] as CameraView[]).map((v) => <button key={v} aria-pressed={view === v} onClick={() => { setView(v); setCameraVersion((n) => n + 1) }}>{v.replace('-', ' ')}</button>)}{teamPreview && <span className="p-2 text-xs text-ink-3">PREVIEW · All eight animate together; no real task or handoffs</span>}<button onClick={() => setPaused((s) => !s)}>{paused ? 'Resume animation' : 'Pause animation'}</button></div>
      </section>
      <aside className="mission-panel familiar-preview-panel">
        <span className="familiar-eyebrow">ANIMATION LAB / PREVIEW ONLY</span><label>Character<Select aria-label="Preview familiar" value={selected} onChange={(e) => { setSelected(e.target.value as FamiliarId); setTeamPreview(false); setMetrics(null) }}>{FAMILIARS.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.animal}</option>)}</Select></label><h3>{state.replaceAll('_', ' ')}</h3><p>{EXPRESSIONS[state]}</p>
        <label>Preview state<Select aria-label="Preview state" value={state} onChange={(e) => { setCycling(false); setState(e.target.value as MascotState) }}>{MASCOT_STATES.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</Select></label>
        <div className="familiar-state-buttons">{MASCOT_STATES.map((s) => <button key={s} aria-pressed={s === state} onClick={() => { setCycling(false); setState(s) }}>{s.replaceAll('_', ' ')}</button>)}</div>
        <button className="familiar-cycle-button" aria-pressed={cycling} onClick={() => setCycling((s) => !s)}>{cycling ? 'Stop state preview' : 'Play state preview'}</button>
        <label>Visual quality<Select aria-label="Visual quality" value={quality} onChange={(e) => useApp.getState().updatePreferences({ mascotQuality: e.target.value as VisualQuality })}>{['low', 'medium', 'high', 'cinematic'].map((q) => <option key={q} value={q}>{q}</option>)}</Select></label>
        <label>Motion preference<Select aria-label="Motion preference" value={motion} onChange={(e) => useApp.getState().updatePreferences({ mascotMotion: e.target.value as 'off' | 'subtle' | 'full' })}><option value="off">Off</option><option value="subtle">Subtle</option><option value="full">Full</option></Select></label>
        <p className="text-[10px]">Reduced-motion accessibility overrides animation. Hidden/offscreen views pause. Slow rendering reduces pixel density.</p>
      </aside>
    </div>
    <div className="mission-panel familiar-telemetry" aria-label="3D renderer diagnostics"><span>One WebGL renderer</span><span>{teamPreview ? 'Eight simultaneous previews · FPS shown in scene' : metrics ? `${metrics.fps} render FPS · DPR ${metrics.dpr}` : 'Measuring visible animation…'}</span><span>{metrics ? `${metrics.calls} draw calls · ${metrics.triangles.toLocaleString()} triangles` : 'Local procedural geometry'}</span><span>{metrics ? `${metrics.geometries} geometries · ${metrics.textures} textures` : 'No image textures on character'}</span></div>
    <p className="text-xs text-ink-3">These are procedural articulated prototypes, not sculpted production rigs. The live roster uses actual execution and approval evidence; these gallery previews never run a task. Telegram identities, model controls and Zero's approval authority are unchanged.</p>
    <FamiliarRecordingControls preview />
    <details className="mission-panel rounded-xl p-4"><summary className="cursor-pointer text-sm">Original identity references · static artwork</summary><div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">{FAMILIARS.map((f) => <article key={f.id}><img loading="lazy" className="w-full rounded-lg" src={`/hardlight/avatars_png/${f.id}_512.png`} alt={`${f.name} original static concept reference`} /><p className="mt-2 text-xs" style={{ color: f.color }}>{f.name} · {f.animal}</p><a className="text-[10px] text-azure-hi" href={`/hardlight/avatars_png/${f.id}_512.png`} download>PNG portrait reference</a></article>)}</div><p className="mt-3 text-xs text-ink-4">Telegram profile portraits remain static. No real bot profile was modified.</p></details>
  </div>
}
