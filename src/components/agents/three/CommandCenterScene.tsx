import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Group, Mesh, QuadraticBezierCurve3, Vector3 } from 'three'
import { FAMILIARS, type FamiliarId, type MascotState } from '@/data/familiars'
import { useApp } from '@/store/app'
import { resolveFamiliarQuality } from '@/lib/familiarPerformance'
import type { VisibleFamiliarInteraction } from '@/lib/useFamiliarInteractions'
import { FamiliarRig } from './FamiliarRig'
import { FramePump, Monitor, type RenderMetrics } from './FamiliarStage'
import { ContextLossGuard } from './ContextLossGuard'
const ControlledBloom = lazy(() => import('./ControlledBloom'))
const POSITIONS = Object.fromEntries(FAMILIARS.map((f, i) => [f.id, [(i % 4 - 1.5) * 4, 0, i < 4 ? -2.4 : 2.4]])) as Record<FamiliarId, [number, number, number]>

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <p className="familiar-3d-fallback">3D command center unavailable. Return to the roster; tasks and approvals remain available.</p> : this.props.children }
}

function Actor({ id, state, motion, reduced, active, detail, interactions, onInspect }: { id: FamiliarId; state: MascotState; motion: 'off' | 'subtle' | 'full' | 'cinematic'; reduced: boolean; active: boolean; detail: number; interactions: VisibleFamiliarInteraction[]; onInspect: (id: FamiliarId) => void }) {
  const ref = useRef<Group>(null), task = useRef<Group>(null), familiar = FAMILIARS.find((f) => f.id === id)!
  useFrame((_, delta) => {
    if (!ref.current || !active) return
    const event = interactions.find((e) => e.from !== e.to && (e.from === id || e.to === id))
    const other = event ? POSITIONS[event.from === id ? event.to : event.from] : null, own = POSITIONS[id]
    const angle = other && !reduced && motion !== 'off' ? Math.atan2(other[0] - own[0], other[2] - own[2]) : 0
    const difference = Math.atan2(Math.sin(angle - ref.current.rotation.y), Math.cos(angle - ref.current.rotation.y))
    ref.current.rotation.y += difference * (reduced || motion === 'off' ? 1 : 1 - Math.exp(-Math.min(delta, .08) * 5))
    if (task.current && active && !reduced && motion !== 'off') task.current.rotation.y += Math.min(delta, .08) * .35
  })
  return <group position={POSITIONS[id]}>
    <group ref={ref} scale={0.72} onClick={(e) => { e.stopPropagation(); onInspect(id) }}>
      <FamiliarRig id={id} state={state} motion={motion} reduced={reduced} active={active} detail={detail} />
    </group>
    <mesh position={[0, -.12, 0]}><cylinderGeometry args={[1.6, 1.75, .16, 32]} /><meshStandardMaterial color="#14243a" metalness={.65} roughness={.4} /></mesh>
    <mesh position={[0, -.025, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[1.63, .018, 5, 48]} /><meshBasicMaterial color={familiar.color} /></mesh>
    {['working', 'reviewing'].includes(state) && <group ref={task} position={[1, 1.25, .9]} rotation={[0, -.5, .08]}><mesh><boxGeometry args={[.65, .48, .045]} /><meshStandardMaterial color="#10384c" emissive={familiar.color} emissiveIntensity={.16} transparent opacity={.8} /></mesh>{[-.1, 0, .1].map((y) => <mesh key={y} position={[-.04, y, .03]}><boxGeometry args={[.4, .014, .01]} /><meshBasicMaterial color={familiar.color} /></mesh>)}</group>}
  </group>
}

function Labels({ elements }: { elements: React.RefObject<Record<string, HTMLDivElement | null>> }) {
  const camera = useThree((s) => s.camera), size = useThree((s) => s.size)
  const point = useMemo(() => new Vector3(), [])
  useFrame(() => { for (const f of FAMILIARS) { const element = elements.current[f.id]; if (!element) continue; const p = POSITIONS[f.id]; point.set(p[0], -.2, p[2] + 1.2).project(camera); element.style.transform = `translate(${(point.x * .5 + .5) * size.width}px,${(-point.y * .5 + .5) * size.height}px) translate(-50%,0)`; element.style.visibility = point.z > 1 || point.z < -1 ? 'hidden' : 'visible' } })
  return null
}

function Cue({ event, reduced, active }: { event: VisibleFamiliarInteraction; reduced: boolean; active: boolean }) {
  const ref = useRef<Mesh>(null), progress = useRef(0), a = POSITIONS[event.from], b = POSITIONS[event.to]
  const curve = useMemo(() => new QuadraticBezierCurve3(new Vector3(a[0], 1.2, a[2]), new Vector3((a[0] + b[0]) / 2, 4, (a[2] + b[2]) / 2), new Vector3(b[0], 1.2, b[2])), [a, b])
  useFrame((_, delta) => { if (!ref.current) return; if (active && !reduced) progress.current = Math.min(1, progress.current + Math.min(delta, .08) / 3); const t = reduced ? .5 : progress.current; ref.current.position.copy(event.from === event.to ? new Vector3(a[0], 2, a[2]) : curve.getPoint(t)); ref.current.scale.setScalar(reduced ? .12 : .12 + Math.sin(t * Math.PI) * .12) })
  return <mesh ref={ref}><octahedronGeometry args={[1]} /><meshBasicMaterial color={event.kind === 'approval' ? '#f5bb52' : '#8adfff'} /></mesh>
}

function Evidence() {
  const scene = useThree((s) => s.scene), gl = useThree((s) => s.gl), camera = useThree((s) => s.camera)
  useEffect(() => { if (!import.meta.env.DEV) return; const host = window as unknown as Record<string, unknown>, entry = { scene, gl, camera }; host.__commandCenter = entry; return () => { if (host.__commandCenter === entry) delete host.__commandCenter } }, [scene, gl, camera])
  return null
}

export default function CommandCenterScene({ states, preview = false, provenance = 'idle', interactions = [], onInspect, active = true, paused = false }: { states: Record<FamiliarId, MascotState>; preview?: boolean; provenance?: 'live' | 'history' | 'simulation' | 'idle'; interactions?: VisibleFamiliarInteraction[]; onInspect: (id: FamiliarId) => void; active?: boolean; paused?: boolean }) {
  const labels = useRef<Record<string, HTMLDivElement | null>>({})
  const [metrics, setMetrics] = useState<RenderMetrics | null>(null)
  const preferences = useApp((s) => s.preferences), [visible, setVisible] = useState(true), [foreground, setForeground] = useState(() => !document.hidden), [reducedSystem, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches), [lost, setLost] = useState(false), host = useRef<HTMLDivElement>(null)
  useEffect(() => { const observer = new IntersectionObserver(([e]) => setVisible(e.isIntersecting)); if (host.current) observer.observe(host.current); const update = () => setForeground(!document.hidden), media = matchMedia('(prefers-reduced-motion: reduce)'), motion = () => setReduced(media.matches); document.addEventListener('visibilitychange', update); media.addEventListener('change', motion); return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); media.removeEventListener('change', motion) } }, [])
  const reduced = preferences.reduceMotion || reducedSystem, motion = paused ? 'off' : preferences.mascotMotion ?? 'subtle', quality = preferences.mascotQuality ?? 'medium', running = visible && foreground && active
  const settings = resolveFamiliarQuality(quality, { activeFamiliars: 8, visible: running, motion, reducedMotion: reduced, devicePixelRatio: window.devicePixelRatio })
  const caption = preview ? 'PREVIEW · No real work or handoffs' : provenance === 'history' ? 'HISTORY · No live execution; native approval state is separate' : provenance === 'simulation' ? 'SIMULATION · No real agent execution' : provenance === 'idle' ? 'IDLE · No active task; movement is personality only' : 'ACTUAL TASK EVIDENCE · Idle movement is personality, not proof of work'
  return <div ref={host} className="familiar-command-center" aria-label="Hardlight 3D command center" data-preview={preview}>
    <div className="familiar-3d-caption"><span>{caption}</span><span>8 ARTICULATED 3D CHARACTERS · 1 RENDERER</span></div>
    {lost ? <p className="familiar-3d-fallback">WebGL unavailable. Return to the roster for labeled static fallbacks.</p> : <SceneBoundary><Canvas frameloop={running ? 'demand' : 'never'} dpr={settings.dpr} camera={{ position: [9, 8, 14], fov: 35, near: .1, far: 80 }} gl={{ antialias: settings.antialias, powerPreference: 'default' }}>
      <ContextLossGuard onLoss={() => setLost(true)} />
      <color attach="background" args={['#070e1b']} /><ambientLight intensity={1} /><hemisphereLight args={['#d5f3ff', '#182843', 1.4]} /><directionalLight position={[4, 12, 6]} intensity={2.6} /><directionalLight position={[-8, 5, -5]} color="#519fff" intensity={2} />
      <FramePump animate={running && settings.maxFPS > 0} fps={settings.maxFPS} />
      {FAMILIARS.map((f) => <Actor key={f.id} id={f.id} state={states[f.id]} motion={motion} reduced={reduced} active={running} detail={Math.min(1, settings.geometryDetail)} interactions={preview ? [] : interactions} onInspect={onInspect} />)}
      {!preview && interactions.map((event) => <Cue key={event.id} event={event} reduced={reduced || motion === 'off'} active={running} />)}
      <mesh position={[0, -.3, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[30, 64]} /><meshStandardMaterial color="#0b1425" metalness={.45} roughness={.65} /></mesh>
      <OrbitControls makeDefault enabled={active} target={[0, .7, 0]} enablePan={false} minDistance={11} maxDistance={32} minPolarAngle={.35} maxPolarAngle={1.45} />
      {['high', 'cinematic'].includes(quality) && <Suspense fallback={null}><ControlledBloom /></Suspense>}
      <Evidence />
      <Labels elements={labels} />
      <Monitor enabled={running && settings.maxFPS > 0} targetFps={settings.maxFPS} onMetrics={setMetrics} />
    </Canvas></SceneBoundary>}
    <div className="familiar-world-labels">{FAMILIARS.map((f) => <div key={f.id} ref={(node) => { labels.current[f.id] = node }}><strong style={{ color: f.color }}>{f.name}</strong><span>{states[f.id].replaceAll('_', ' ')}</span></div>)}</div>
    <p className="familiar-3d-controls">Click to inspect · Drag to orbit · Scroll to zoom · {metrics ? metrics.fps ? `${metrics.fps} render FPS · DPR ${metrics.dpr}` : 'Demand rendering / paused' : 'Measuring render FPS…'} · AI review is not owner approval</p>
  </div>
}
