import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, View } from '@react-three/drei'
import type { Scene, WebGLRenderer } from 'three'
import { FAMILIARS, type FamiliarId, type MascotState } from '@/data/familiars'
import { resolveFamiliarQuality, type FamiliarQuality } from '@/lib/familiarPerformance'
import { useApp } from '@/store/app'
import { FamiliarRig } from './FamiliarRig'
import { ContextLossGuard } from './ContextLossGuard'

interface Scope { focused: boolean; failed: boolean; reduced: boolean; motion: 'off' | 'subtle' | 'full' | 'cinematic'; quality: FamiliarQuality; register: (key: string, visible: boolean) => void }
const Context = createContext<Scope | null>(null)
function RendererEvidence() {
  const gl = useThree((s) => s.gl)
  useEffect(() => { if (!import.meta.env.DEV) return; const host = window as unknown as Record<string, unknown>; host.__familiarRenderer = gl; return () => { if (host.__familiarRenderer === gl) delete host.__familiarRenderer } }, [gl])
  return null
}
class CanvasBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onFailure() }
  render() { return this.state.failed ? null : this.props.children }
}

function SharedClock({ animate, fps, visible }: { animate: boolean; fps: number; visible: boolean }) {
  const invalidate = useThree((s) => s.invalidate), gl = useThree((s) => s.gl)
  const frames = useRef(0), began = useRef(performance.now()), slow = useRef(0), setDpr = useThree((s) => s.setDpr)
  useEffect(() => {
    invalidate(); if (!animate || !visible) return
    const timer = window.setInterval(invalidate, 1000 / Math.max(1, fps))
    return () => window.clearInterval(timer)
  }, [animate, fps, visible, invalidate])
  useFrame(() => { gl.setScissorTest(false); gl.setClearColor(0x000000, 0); gl.clear(true, true, true) }, 0)
  useFrame(() => {
    frames.current++
    const now = performance.now(), elapsed = (now - began.current) / 1000
    if (elapsed < 2) return
    const actual = frames.current / elapsed
    slow.current = animate && actual < fps * 0.6 ? slow.current + 1 : 0
    if (slow.current >= 2 && gl.getPixelRatio() > 1) { setDpr(Math.max(1, gl.getPixelRatio() - 0.25)); slow.current = 0 }
    frames.current = 0; began.current = now
  }, -2)
  return null
}

/** One transparent scissored WebGL context for every thumbnail and expanded inspector. */
export function FamiliarRenderScope({ children, focused = false }: { children: ReactNode; focused?: boolean }) {
  const root = useRef<HTMLDivElement>(null), [failed, setFailed] = useState(false), [views, setViews] = useState<Record<string, boolean>>({})
  const [foreground, setForeground] = useState(() => !document.hidden), [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const preferences = useApp((s) => s.preferences), quality = preferences.mascotQuality ?? 'medium', motion = preferences.mascotMotion ?? 'subtle'
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)'), wake = () => setForeground(!document.hidden), reduce = () => setSystemReduced(media.matches)
    document.addEventListener('visibilitychange', wake); media.addEventListener('change', reduce)
    return () => { document.removeEventListener('visibilitychange', wake); media.removeEventListener('change', reduce) }
  }, [])
  const register = useCallback((key: string, visible: boolean) => setViews((old) => old[key] === visible ? old : { ...old, [key]: visible }), [])
  const reduced = preferences.reduceMotion || systemReduced, count = Object.values(views).filter(Boolean).length
  const settings = resolveFamiliarQuality(quality, { activeFamiliars: count, devicePixelRatio: window.devicePixelRatio, motion, reducedMotion: reduced, visible: foreground && count > 0 })
  const scope = useMemo<Scope>(() => ({ focused, failed, reduced, motion, quality, register }), [focused, failed, reduced, motion, quality, register])
  return <Context.Provider value={scope}><div ref={root} className="familiar-render-scope">{children}{!failed && count > 0 && <CanvasBoundary onFailure={() => setFailed(true)}><Canvas key={settings.antialias ? 'aa' : 'no-aa'} eventSource={root} eventPrefix="client" frameloop="demand" dpr={settings.dpr} gl={{ antialias: settings.antialias, alpha: true, powerPreference: 'default' }} style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 51 }} fallback={<span>WebGL unavailable</span>} onCreated={({ gl }) => {
    gl.setClearColor(0x000000, 0)
  }}>
    <SharedClock animate={settings.maxFPS > 0} fps={settings.maxFPS} visible={foreground && count > 0} />
    <RendererEvidence />
    <ContextLossGuard onLoss={() => setFailed(true)} />
    <View.Port />
  </Canvas></CanvasBoundary>}</div></Context.Provider>
}

function ViewEvidence({ id }: { id: FamiliarId }) {
  const scene = useThree((s) => s.scene), camera = useThree((s) => s.camera), gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const host = window as unknown as { __familiarViews?: Map<string, { scene: Scene; gl: WebGLRenderer; camera: typeof camera }> }
    const map = host.__familiarViews ??= new Map()
    const entry = { scene, gl, camera }; map.set(id, entry)
    return () => { if (map.get(id) === entry) map.delete(id) }
  }, [scene, camera, gl, id])
  return null
}

export function FamiliarView({ id, state, portrait = false, preview = false }: { id: FamiliarId; state: MascotState; portrait?: boolean; preview?: boolean }) {
  const scope = useContext(Context), host = useRef<HTMLElement>(null), [intersecting, setIntersecting] = useState(true), [foreground, setForeground] = useState(() => !document.hidden)
  const familiar = FAMILIARS.find((f) => f.id === id)!
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => setIntersecting(e.isIntersecting)); if (host.current) observer.observe(host.current)
    const update = () => setForeground(!document.hidden); document.addEventListener('visibilitychange', update)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update) }
  }, [])
  const visible = !!scope && intersecting && foreground && (!scope.focused || portrait), key = `${id}-${portrait ? 'inspector' : 'roster'}`
  useEffect(() => { scope?.register(key, visible); return () => scope?.register(key, false) }, [scope?.register, key, visible])
  if (!scope || scope.failed) return <div className={`agent-mascot mascot-reference ${portrait ? 'mascot-portrait' : ''}`} data-state={state} data-renderer="fallback"><img src={`/hardlight/avatars_png/${id}_512.png`} alt={`${familiar.name} static reference fallback`} /><span className="mascot-fallback-label">Static reference · 3D unavailable</span></div>
  const settings = resolveFamiliarQuality(scope.quality, { activeFamiliars: portrait ? 1 : 8, reducedMotion: scope.reduced, motion: scope.motion, visible })
  return <View ref={host} className={`agent-mascot mascot-3d ${portrait ? 'mascot-portrait' : ''}`} visible={visible} data-state={state} data-renderer="three" data-familiar={id} data-visible={visible} aria-label={`${familiar.name} · ${familiar.animal} · ${preview ? 'Preview' : state.replaceAll('_', ' ')} · articulated 3D`}>
    <PerspectiveCamera makeDefault position={[4.3, 2.9, 5.5]} fov={35} near={0.1} far={30} onUpdate={(camera) => camera.lookAt(0, 1.25, 0)} />
    <ambientLight intensity={1.1} color="#d9edff" /><hemisphereLight args={['#dff8ff', '#17223a', 1.3]} /><directionalLight position={[3, 6, 4]} intensity={2.3} /><directionalLight position={[-3, 2, -3]} color={familiar.color} intensity={2} />
    <mesh position={[0, -0.11, 0]}><cylinderGeometry args={[2.0, 2.1, 0.12, portrait ? 48 : 24]} /><meshStandardMaterial color="#102036" metalness={0.7} roughness={0.4} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}><torusGeometry args={[2.0, 0.017, 4, portrait ? 64 : 24]} /><meshBasicMaterial color={familiar.color} /></mesh>
    <FamiliarRig id={id} state={state} motion={scope.motion} reduced={scope.reduced} active={visible} detail={settings.geometryDetail} />
    {portrait && <OrbitControls makeDefault enablePan={false} target={[0, 1.25, 0]} minDistance={3.7} maxDistance={10} minPolarAngle={0.35} maxPolarAngle={1.62} />}
    <ViewEvidence id={id} />
  </View>
}
