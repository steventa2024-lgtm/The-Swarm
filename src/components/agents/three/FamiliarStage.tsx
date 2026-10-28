import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Color, Group } from 'three'
import { FAMILIARS, type FamiliarId, type MascotState } from '@/data/familiars'
import { QUALITY_PRESETS } from '@/lib/familiarPerformance'
import { FamiliarRig } from './FamiliarRig'
import { ContextLossGuard } from './ContextLossGuard'
const ControlledBloom = lazy(() => import('./ControlledBloom'))

export type VisualQuality = 'low' | 'medium' | 'high' | 'cinematic'
export type CameraView = 'three-quarter' | 'front' | 'side' | 'rear'
export type MotionLevel = 'off' | 'subtle' | 'full' | 'cinematic'
export interface RenderMetrics { fps: number; calls: number; triangles: number; geometries: number; textures: number; dpr: number }
const VIEWS: Record<CameraView, [number, number, number]> = {
  'three-quarter': [4.3, 2.9, 5.5], front: [0, 2.1, 6.8], side: [6.5, 2.3, 0], rear: [0.4, 2.7, -6.8],
}

class RenderBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onFailure() }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function Fallback({ onRetry, id }: { onRetry: () => void; id: FamiliarId }) {
  return <div className="familiar-3d-fallback" role="status"><strong>3D renderer unavailable</strong><p>Agent tasks and approval controls remain available. This is a labeled static reference fallback.</p><img src={`/hardlight/avatars_png/${id}_512.png`} alt={`Static ${id} reference — 3D unavailable`} /><button onClick={onRetry}>Retry 3D</button></div>
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update) }, [])
  return reduced
}

/** Demand rendering: no animation timer while hidden, offscreen, or motion is disabled. */
export function FramePump({ animate, fps }: { animate: boolean; fps: number }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => { invalidate(); if (!animate) return; const timer = window.setInterval(invalidate, 1000 / fps); return () => window.clearInterval(timer) }, [animate, fps, invalidate])
  return null
}

function SceneEvidence({ id }: { id: FamiliarId }) {
  const scene = useThree((s) => s.scene), gl = useThree((s) => s.gl), camera = useThree((s) => s.camera)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const host = window as unknown as Record<string, unknown>
    const evidence = { scene, gl, camera, exportGLB: async () => {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
      const model = scene.getObjectByName(id === 'codex' ? 'codex-articulated-wolf' : `familiar-${id}`)
      if (!model) throw new Error('The articulated model is not mounted')
      return new GLTFExporter().parseAsync(model, { binary: true, onlyVisible: true })
    } }
    host.__familiar3d = evidence
    return () => { if (host.__familiar3d === evidence) delete host.__familiar3d }
  }, [scene, gl, camera, id])
  return null
}

function CameraRig({ view, version }: { view: CameraView; version: number }) {
  const camera = useThree((s) => s.camera), invalidate = useThree((s) => s.invalidate)
  useEffect(() => { camera.position.set(...VIEWS[view]); camera.lookAt(0, 1.2, 0); camera.updateProjectionMatrix(); invalidate() }, [camera, view, version, invalidate])
  return <OrbitControls key={`${view}-${version}`} makeDefault target={[0, 1.2, 0]} enablePan={false} minDistance={3.7} maxDistance={10} minPolarAngle={0.35} maxPolarAngle={1.62} enableDamping dampingFactor={0.12} />
}

export function HolographicSpace({ count, animate }: { count: number; animate: boolean }) {
  const particles = useRef<Group>(null)
  useFrame((_, delta) => { if (particles.current && animate) particles.current.rotation.y += Math.min(delta, 0.08) * 0.08 })
  return <>
    <color attach="background" args={['#070e1c']} />
    <fog attach="fog" args={['#070e1c', 11, 22]} />
    <ambientLight intensity={0.7} color="#b7d8ff" />
    <hemisphereLight args={['#d9f5ff', '#172139', 1.6]} />
    <directionalLight position={[3, 6, 4]} intensity={2.4} color="#d1eaff" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={5} shadow-camera-bottom={-4} shadow-bias={-0.001} />
    <directionalLight position={[-4, 2, -3]} intensity={1.9} color="#3686ff" />
    <pointLight position={[0, 2, 2]} intensity={1.5} color="#3ee3ff" distance={5} />
    <mesh position={[0, -0.12, 0]} receiveShadow><cylinderGeometry args={[2.05, 2.2, 0.18, 64]} /><meshStandardMaterial color="#101e35" metalness={0.8} roughness={0.32} /></mesh>
    {[1.88, 2.02, 2.16].map((r, i) => <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.017 + i * 0.005, 0]}><torusGeometry args={[r, i === 1 ? 0.018 : 0.007, 6, 80]} /><meshBasicMaterial color={i === 1 ? '#32cfff' : '#174f86'} /></mesh>)}
    <group ref={particles}>{Array.from({ length: count }, (_, i) => { const angle = i * 2.39996; return <mesh key={i} position={[Math.cos(angle) * (2 + i % 3 * 0.15), 0.45 + (i % 7) * 0.4, Math.sin(angle) * 2]} rotation={[i, i * 0.7, i * 0.3]}><octahedronGeometry args={[0.025 + i % 3 * 0.009]} /><meshBasicMaterial color="#38bfff" transparent opacity={0.45} /></mesh> })}</group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.22, 0]} receiveShadow><circleGeometry args={[60, 64]} /><meshStandardMaterial color="#070e1c" roughness={0.65} metalness={0.35} /></mesh>
  </>
}

export function Monitor({ enabled, targetFps, onMetrics }: { enabled: boolean; targetFps: number; onMetrics?: (m: RenderMetrics) => void }) {
  const gl = useThree((s) => s.gl), setDpr = useThree((s) => s.setDpr)
  const start = useRef(0), frames = useRef(0), slow = useRef(0)
  useEffect(() => { if (!enabled) onMetrics?.({ fps: 0, calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, dpr: gl.getPixelRatio() }) }, [enabled, gl, onMetrics])
  useFrame(() => {
    if (!enabled) { start.current = 0; frames.current = 0; return }
    const now = performance.now(); if (!start.current) start.current = now
    frames.current++
    const seconds = (now - start.current) / 1000
    if (seconds < 2) return
    const fps = frames.current / seconds
    onMetrics?.({ fps: Math.round(fps), calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, dpr: gl.getPixelRatio() })
    slow.current = fps < targetFps * 0.65 ? slow.current + 1 : 0
    if (slow.current >= 2 && gl.getPixelRatio() > 1) { setDpr(Math.max(1, gl.getPixelRatio() - 0.25)); slow.current = 0 }
    start.current = now; frames.current = 0
  })
  return null
}

/** One renderer for the inspected character; no image is mapped onto its geometry. */
export default function FamiliarStage({ id = 'codex', state, preview = false, quality = 'medium', motion = 'subtle', reducedMotion = false, view = 'three-quarter', cameraVersion = 0, onMetrics }: { id?: FamiliarId; state: MascotState; preview?: boolean; quality?: VisualQuality; motion?: MotionLevel; reducedMotion?: boolean; view?: CameraView; cameraVersion?: number; onMetrics?: (m: RenderMetrics) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true), [foreground, setForeground] = useState(() => !document.hidden), [lost, setLost] = useState(false), [generation, setGeneration] = useState(0)
  const reduced = useReducedMotion() || reducedMotion, settings = QUALITY_PRESETS[quality]
  const active = visible && foreground, animate = active && motion !== 'off' && !reduced && state !== 'offline'
  useEffect(() => { const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting)); if (host.current) observer.observe(host.current); const update = () => setForeground(!document.hidden); document.addEventListener('visibilitychange', update); return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update) } }, [])
  const retry = () => { setLost(false); setGeneration((n) => n + 1) }
  const fallback = <Fallback id={id} onRetry={retry} />
  return <div ref={host} className="familiar-3d-stage" data-familiar={id} data-state={state} data-renderer={lost ? 'fallback' : 'three'} data-motion={reduced ? 'off' : motion} data-active={active} aria-label={`${FAMILIARS.find((f) => f.id === id)?.name} articulated 3D viewport`}>
    <div className="familiar-3d-caption"><span>{preview ? 'PREVIEW · No agent task is running' : 'Actual agent state'} · {state.replaceAll('_', ' ')}</span><span>{lost ? 'STATIC REFERENCE FALLBACK' : 'REAL 3D · Articulated mesh'}</span></div>
    {lost ? fallback : <RenderBoundary key={generation} onFailure={() => setLost(true)} fallback={fallback}><Suspense fallback={<div className="familiar-3d-fallback">Loading local 3D geometry…</div>}><Canvas key={settings.antialias ? 'aa' : 'no-aa'} frameloop={active ? 'demand' : 'never'} dpr={settings.dpr} shadows={quality !== 'low'} camera={{ position: VIEWS[view], fov: 35, near: 0.1, far: 60 }} gl={{ antialias: settings.antialias, alpha: false, powerPreference: 'default' }} fallback={<span>WebGL unavailable</span>} onCreated={({ gl }) => gl.setClearColor(new Color('#070e1c'))}>
      <ContextLossGuard onLoss={() => setLost(true)} />
      <FramePump animate={animate} fps={settings.maxFPS} />
      <SceneEvidence id={id} />
      <CameraRig view={view} version={cameraVersion} />
      <HolographicSpace count={state === 'offline' || reduced || motion === 'off' ? 0 : settings.particleBudget} animate={animate} />
      <FamiliarRig id={id} state={state} motion={motion} reduced={reduced} active={active} detail={settings.geometryDetail} />
      <Monitor enabled={animate} targetFps={settings.maxFPS} onMetrics={onMetrics} />
      {['high', 'cinematic'].includes(quality) && <Suspense fallback={null}><ControlledBloom /></Suspense>}
    </Canvas></Suspense></RenderBoundary>}
    <p className="familiar-3d-controls">Drag to orbit · Scroll / pinch to zoom · Camera movement does not activate an agent</p>
  </div>
}
