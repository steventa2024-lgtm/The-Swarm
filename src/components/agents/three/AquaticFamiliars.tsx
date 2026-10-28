import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry, CatmullRomCurve3, CylinderGeometry, Float32BufferAttribute, Group,
  IcosahedronGeometry, MeshStandardMaterial, OctahedronGeometry, SphereGeometry,
  TorusGeometry, TubeGeometry, Vector3,
} from 'three'
import type { FamiliarPose } from '@/lib/familiarAnimation'

type AquaticId = 'deepseek' | 'ollama'
type V3 = [number, number, number]
type Finish = 'body' | 'belly' | 'frame' | 'crystal' | 'glow' | 'eye' | 'white' | 'inner'

/** Closed front/back fans and side walls: fins and ears have real thickness. */
function solidOutline(outline: Array<[number, number]>, depth: number): BufferGeometry {
  const vertices: number[] = []
  const area = outline.reduce((sum, point, i) => { const next = outline[(i + 1) % outline.length]; return sum + point[0] * next[1] - next[0] * point[1] }, 0)
  const points = area < 0 ? [...outline].reverse() : outline
  const center: V3 = [points.reduce((n, p) => n + p[0], 0) / points.length, points.reduce((n, p) => n + p[1], 0) / points.length, depth]
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    const af: V3 = [a[0], a[1], depth], bf: V3 = [b[0], b[1], depth]
    const ab: V3 = [a[0], a[1], -depth], bb: V3 = [b[0], b[1], -depth]
    vertices.push(...center, ...af, ...bf, center[0], center[1], -depth, ...bb, ...ab)
    vertices.push(...af, ...ab, ...bb, ...af, ...bb, ...bf)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  return geometry
}

function resourcesFor(id: AquaticId, detail: number) {
  const high = detail >= 2
  const geometries = {
    round: new SphereGeometry(1, high ? 24 : 16, high ? 16 : 10),
    facet: new IcosahedronGeometry(1, detail > 0 ? 1 : 0),
    crystal: new OctahedronGeometry(1),
    bone: new CylinderGeometry(0.5, 0.42, 1, 8),
    ring: new TorusGeometry(1, 0.035, 5, 28),
    fin: solidOutline([[0, 0], [0.35, 0.26], [0.95, 0.2], [1.3, -0.08], [0.58, -0.3], [0.08, -0.17]], 0.065),
    dorsal: solidOutline([[-0.24, 0], [-0.06, 0.52], [0.15, 0.28], [0.3, 0]], 0.065),
    ear: solidOutline([[-0.09, 0], [-0.13, 0.35], [-0.02, 0.68], [0.11, 0.38], [0.09, 0]], 0.065),
    upperLid: new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    lowerLid: new SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    groove: new TubeGeometry(new CatmullRomCurve3([new Vector3(0, -0.35, -0.6), new Vector3(0, -0.56, 0), new Vector3(0, -0.47, 0.7), new Vector3(0, -0.25, 1.16)]), 18, 0.012, 5, false),
  }
  const whale = id === 'deepseek'
  const materials: Record<Finish, MeshStandardMaterial> = {
    body: new MeshStandardMaterial({ color: whale ? '#056da8' : '#e6e8dd', metalness: whale ? 0.27 : 0.04, roughness: whale ? 0.22 : 0.8 }),
    belly: new MeshStandardMaterial({ color: whale ? '#c4f2ff' : '#fff8e9', metalness: 0.03, roughness: whale ? 0.4 : 0.85 }),
    frame: new MeshStandardMaterial({ color: whale ? '#032541' : '#2a493a', metalness: 0.4, roughness: 0.45 }),
    crystal: new MeshStandardMaterial({ color: whale ? '#20bfff' : '#28a86b', emissive: whale ? '#005ca0' : '#074c28', emissiveIntensity: 0.55, metalness: 0.23, roughness: 0.2, flatShading: true }),
    glow: new MeshStandardMaterial({ color: whale ? '#94f4ff' : '#9cffb7', emissive: whale ? '#26dfff' : '#45ee8b', emissiveIntensity: 1.5, toneMapped: false, roughness: 0.25 }),
    eye: new MeshStandardMaterial({ color: '#020a12', metalness: 0.18, roughness: 0.15 }),
    white: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.25 }),
    inner: new MeshStandardMaterial({ color: whale ? '#168cd0' : '#c9b395', roughness: 0.65 }),
  }
  return { geometries, materials }
}
type Resources = ReturnType<typeof resourcesFor>
function useResources(id: AquaticId, detail: number) {
  const resources = useMemo(() => resourcesFor(id, Math.max(0, Math.min(2, Math.floor(detail)))), [id, detail])
  useEffect(() => () => {
    Object.values(resources.geometries).forEach((geometry) => geometry.dispose())
    Object.values(resources.materials).forEach((material) => material.dispose())
  }, [resources])
  return resources
}
function Solid({ r, finish = 'body', shape = 'round', position, rotation, scale, name }: {
  r: Resources; finish?: Finish; shape?: keyof Resources['geometries']; position?: V3; rotation?: V3; scale?: V3; name?: string
}) {
  return <mesh name={name} geometry={r.geometries[shape]} material={r.materials[finish]} position={position} rotation={rotation} scale={scale} castShadow receiveShadow />
}

/** Volumetric eyeballs, iris and separately articulated upper/lower lid shells. */
function Eyes({ id, r, pose, separation, y, z, size, sideTurn = 0.35 }: {
  id: AquaticId; r: Resources; pose: MutableRefObject<FamiliarPose>; separation: number; y: number; z: number; size: number; sideTurn?: number
}) {
  const upper = useRef<Array<Group | null>>([]), lower = useRef<Array<Group | null>>([]), brows = useRef<Array<Group | null>>([])
  useFrame(() => {
    const p = pose.current, blink = Math.max(0, Math.min(1, p.blink))
    for (let i = 0; i < 2; i++) {
      if (upper.current[i]) { upper.current[i]!.position.y = size * (0.9 - blink * 0.9); upper.current[i]!.scale.y = 0.18 + blink * 0.82 }
      if (lower.current[i]) { lower.current[i]!.position.y = -size * (0.9 - blink * 0.9); lower.current[i]!.scale.y = 0.18 + blink * 0.82 }
      if (brows.current[i]) brows.current[i]!.rotation.z = (i ? 1 : -1) * (0.07 + p.focus * 0.12 - p.mood * 0.07)
    }
  })
  return <>{[-1, 1].map((side, index) => {
    const sideName = side < 0 ? 'left' : 'right'
    return <group key={side} name={`${id}-eye-${sideName}`} position={[side * separation, y, z]} rotation={[0, side * sideTurn, 0]}>
      <Solid r={r} finish="frame" scale={[size * 1.21, size * 1.3, size * 0.63]} />
      <Solid r={r} finish="eye" position={[0, 0, size * 0.31]} scale={[size, size * 1.08, size * 0.64]} />
      <Solid r={r} finish="crystal" position={[0, -size * 0.04, size * 0.84]} scale={[size * 0.61, size * 0.75, size * 0.22]} />
      <Solid r={r} finish="eye" position={[0, -size * 0.04, size * 1.02]} scale={[size * 0.34, size * 0.53, size * 0.08]} />
      <Solid r={r} finish="white" position={[-size * 0.27, size * 0.38, size * 1.09]} scale={[size * 0.17, size * 0.23, size * 0.08]} />
      <group name={`${id}-eye-${sideName}-upper-lid`} ref={(node) => { upper.current[index] = node }} position={[0, size * 0.9, 0]}><Solid r={r} finish="body" shape="upperLid" scale={[size * 1.1, size * 1.15, size * 0.91]} /></group>
      <group name={`${id}-eye-${sideName}-lower-lid`} ref={(node) => { lower.current[index] = node }} position={[0, -size * 0.9, 0]}><Solid r={r} finish="body" shape="lowerLid" scale={[size * 1.1, size * 1.15, size * 0.91]} /></group>
      <group name={`${id}-eye-${sideName}-brow`} ref={(node) => { brows.current[index] = node }} position={[0, size * 1.14, size * 0.39]}><Solid r={r} finish={id === 'ollama' ? 'belly' : 'glow'} shape="facet" scale={[size * 1.05, size * 0.16, size * 0.24]} /></group>
    </group>
  })}</>
}

function DeepSeekWhale({ pose, detail }: { pose: MutableRefObject<FamiliarPose>; detail: number }) {
  const r = useResources('deepseek', detail)
  const root = useRef<Group>(null), body = useRef<Group>(null), head = useRef<Group>(null), jaw = useRef<Group>(null)
  const fins = useRef<Array<Group | null>>([]), dorsal = useRef<Group>(null), tail = useRef<Group>(null), fluke = useRef<Group>(null)
  useFrame(() => {
    const p = pose.current, t = p.time, swim = Math.sin(t * 1.1), power = 0.1 + p.energy * 0.12
    if (root.current) { root.current.position.y = 0.04 - p.crouch * 0.12 + Math.sin(t * 0.8) * 0.045; root.current.rotation.z = p.headYaw * -0.12 }
    if (body.current) body.current.scale.set(1 + p.breathe * 0.4, 1 + p.breathe, 1)
    if (head.current) { head.current.rotation.y = p.headYaw * 0.65; head.current.rotation.x = p.headPitch * 0.45 }
    if (jaw.current) jaw.current.rotation.x = Math.max(0, p.energy - 0.3) * 0.045 + Math.max(0, -p.mood) * 0.025
    fins.current.forEach((fin, index) => { if (fin) { const side = index ? 1 : -1; fin.rotation.z = side * (-0.25 + swim * power); fin.rotation.y = side * (0.8 + p.headYaw * 0.2) } })
    if (dorsal.current) dorsal.current.rotation.z = Math.sin(t * 1.1) * 0.025
    if (tail.current) { tail.current.rotation.x = swim * (0.12 + p.energy * 0.15); tail.current.rotation.y = p.tail * 0.25 }
    if (fluke.current) fluke.current.rotation.x = Math.sin(t * 1.1 - 0.6) * (0.1 + p.energy * 0.13)
    r.materials.glow.emissiveIntensity = 0.9 + p.energy * 1.5 + p.breathe * 3
  })
  return <group name="familiar-deepseek" ref={root} dispose={null}>
    <group name="deepseek-body" ref={body} position={[0, 1.35, -0.1]}>
      <Solid r={r} scale={[0.64, 0.59, 1.16]} />
      <Solid r={r} finish="belly" position={[0, -0.22, 0.24]} scale={[0.57, 0.35, 1.0]} />
      {[-0.34, -0.22, -0.1, 0.02, 0.14, 0.26, 0.36].map((x) => <Solid key={x} name="deepseek-ventral-pleat" r={r} finish="crystal" shape="groove" position={[x, 0, 0.08]} />)}
      {[-1, 1].map((side, index) => <group key={side} name={`deepseek-pectoral-${side < 0 ? 'left' : 'right'}`} ref={(node) => { fins.current[index] = node }} position={[side * 0.49, -0.08, 0.36]}>
        <Solid r={r} finish="frame" shape="fin" scale={[side * 0.85, 0.62, 0.95]} />
        <Solid r={r} finish="body" shape="fin" position={[0, 0.012, 0.025]} scale={[side * 0.81, 0.56, 0.95]} />
        <Solid r={r} finish="glow" shape="fin" position={[side * 0.02, 0.018, 0.075]} scale={[side * 0.65, 0.045, 0.24]} />
      </group>)}
      <group name="deepseek-dorsal-fin" ref={dorsal} position={[0, 0.5, -0.43]} rotation={[0, Math.PI / 2, 0]}>
        <Solid r={r} shape="dorsal" finish="frame" />
        <Solid r={r} shape="dorsal" finish="crystal" position={[0, 0.02, 0.025]} scale={[0.86, 0.91, 0.55]} />
      </group>
      {[-1, 1].flatMap((side) => Array.from({ length: 9 }, (_, i) => <group key={`${side}-${i}`} position={[side * (0.59 - Math.abs(i - 4) * 0.025), 0.1 + Math.sin(i * 1.7) * 0.12, -0.74 + i * 0.18]}>
        <Solid r={r} finish="glow" scale={[0.023, 0.02 + i % 3 * 0.007, 0.032]} />
        {detail > 0 && <Solid r={r} finish="crystal" scale={[0.048, 0.045, 0.018]} rotation={[0, side * Math.PI / 2, 0]} />}
      </group>))}
      <group name="deepseek-head" ref={head} position={[0, 0.065, 0.64]}>
        <Solid r={r} scale={[0.65, 0.61, 0.72]} />
        <Solid r={r} finish="crystal" position={[0, 0.17, 0.35]} scale={[0.6, 0.4, 0.43]} />
        <Solid r={r} finish="frame" position={[0, -0.12, 0.39]} scale={[0.56, 0.14, 0.45]} />
        <group name="deepseek-jaw" ref={jaw} position={[0, -0.16, 0.1]}>
          <Solid r={r} finish="belly" position={[0, -0.13, 0.27]} scale={[0.57, 0.25, 0.48]} />
          <Solid r={r} finish="glow" shape="ring" position={[0, -0.055, 0.39]} rotation={[Math.PI / 2, 0, 0]} scale={[0.54, 0.45, 0.45]} />
        </group>
        <Eyes id="deepseek" r={r} pose={pose} separation={0.51} y={0.04} z={0.39} size={0.145} sideTurn={0.6} />
        {[-1, 1].map((side) => <Solid key={side} r={r} finish="frame" position={[side * 0.065, 0.594, 0.03]} scale={[0.035, 0.018, 0.065]} />)}
      </group>
      <group name="deepseek-tail-peduncle" ref={tail} position={[0, 0.025, -0.98]}>
        <Solid r={r} position={[0, -0.01, -0.17]} scale={[0.3, 0.28, 0.43]} />
        <Solid r={r} finish="belly" position={[0, -0.17, -0.17]} scale={[0.24, 0.12, 0.38]} />
        <group name="deepseek-tail-fluke" ref={fluke} position={[0, -0.01, -0.56]}>
          <Solid r={r} position={[0, 0, -0.05]} scale={[0.21, 0.15, 0.29]} />
          {[-1, 1].map((side) => <group key={side} name={`deepseek-tail-lobe-${side < 0 ? 'left' : 'right'}`} rotation={[Math.PI / 2, side * 0.06, 0]}>
            <Solid r={r} finish="frame" shape="fin" scale={[side * 0.66, 0.83, 0.75]} />
            <Solid r={r} finish="crystal" shape="fin" position={[0, 0, 0.022]} scale={[side * 0.63, 0.76, 0.7]} />
            <Solid r={r} finish="glow" shape="fin" position={[0, 0, 0.075]} scale={[side * 0.5, 0.04, 0.12]} />
          </group>)}
        </group>
      </group>
    </group>
  </group>
}

interface Leg { upper: Group | null; lower: Group | null; hoof: Group | null; side: number; front: boolean }
function LlamaLeg({ r, rig }: { r: Resources; rig: Leg }) {
  const name = `ollama-leg-${rig.front ? 'front' : 'rear'}-${rig.side < 0 ? 'left' : 'right'}`
  return <group name={name} position={[rig.side * 0.29, 0.92, rig.front ? 0.34 : -0.65]}>
    <group name={`${name}-hip`} ref={(node) => { rig.upper = node }}>
      <Solid r={r} finish="body" position={[0, -0.14, 0]} scale={[0.135, 0.22, 0.15]} />
      <Solid r={r} finish="belly" shape="facet" position={[rig.side * 0.02, 0, 0]} scale={[0.17, 0.16, 0.18]} />
      <Solid r={r} finish="body" shape="bone" position={[0, -0.2, 0]} scale={[0.17, 0.4, 0.17]} />
      <group name={`${name}-knee`} ref={(node) => { rig.lower = node }} position={[0, -0.4, 0]}>
        <Solid r={r} finish="belly" scale={[0.105, 0.11, 0.105]} />
        <Solid r={r} finish="body" shape="bone" position={[0, -0.2, 0]} scale={[0.13, 0.4, 0.13]} />
        <group name={`${name}-hoof`} ref={(node) => { rig.hoof = node }} position={[0, -0.4, 0]}>
          {[-1, 1].map((toe) => <Solid key={toe} r={r} finish="frame" position={[toe * 0.047, -0.04, 0.045]} scale={[0.055, 0.065, 0.12]} />)}
          <Solid r={r} finish="belly" position={[0, 0.035, 0.025]} scale={[0.12, 0.085, 0.12]} />
        </group>
      </group>
    </group>
  </group>
}
function solveLlamaLeg(rig: Leg, drop: number, pose: FamiliarPose) {
  if (!rig.upper || !rig.lower || !rig.hoof) return
  const phase = pose.time * 4 + (rig.side > 0 ? Math.PI : 0) + (rig.front ? 0 : Math.PI)
  const lift = Math.max(0, Math.sin(phase)) * pose.stride * 0.12
  const z = -Math.cos(phase) * pose.stride * 0.16
  const h = 0.92 + drop - 0.125 - lift
  const length = Math.max(0.1, Math.min(0.792, Math.hypot(h, z)))
  const bend = Math.PI - Math.acos(Math.max(-1, Math.min(1, (0.32 - length * length) / 0.32)))
  const direction = rig.front ? 1 : -1
  rig.upper.rotation.x = Math.atan2(-z, h) + direction * bend / 2
  rig.lower.rotation.x = -direction * bend
  rig.hoof.rotation.x = -(rig.upper.rotation.x + rig.lower.rotation.x)
}

function OllamaLlama({ pose, detail }: { pose: MutableRefObject<FamiliarPose>; detail: number }) {
  const r = useResources('ollama', detail)
  const root = useRef<Group>(null), torso = useRef<Group>(null), neck = useRef<Group>(null), head = useRef<Group>(null), jaw = useRef<Group>(null), tail = useRef<Group>(null)
  const ears = useRef<Array<Group | null>>([])
  const legs = useMemo<Leg[]>(() => [-1, 1].flatMap((side) => [true, false].map((front) => ({ upper: null, lower: null, hoof: null, side, front }))), [])
  useFrame(() => {
    const p = pose.current, drop = -p.crouch * 0.12
    if (root.current) root.current.position.y = drop
    if (torso.current) torso.current.scale.set(1 + p.breathe * 0.5, 1 + p.breathe, 1 + p.breathe * 0.3)
    if (neck.current) { neck.current.rotation.x = p.headPitch * 0.28; neck.current.rotation.y = p.headYaw * 0.18 }
    if (head.current) { head.current.rotation.y = p.headYaw * 0.8; head.current.rotation.x = p.headPitch * 0.55; head.current.rotation.z = -p.mood * 0.045 }
    if (jaw.current) jaw.current.rotation.x = Math.max(0, p.energy - 0.6) * 0.11
    ears.current.forEach((ear, i) => { if (ear) { ear.rotation.z = (i ? -1 : 1) * (0.12 + (i ? p.earRight : p.earLeft) * 0.65); ear.rotation.x = (i ? p.earRight : p.earLeft) * 0.3 } })
    if (tail.current) { tail.current.rotation.y = p.tail * 0.7; tail.current.rotation.x = -0.6 + p.mood * 0.2 }
    legs.forEach((leg) => solveLlamaLeg(leg, drop, p))
    r.materials.glow.emissiveIntensity = 0.7 + p.energy * 1.2
  })
  return <group name="familiar-ollama" ref={root} dispose={null}>
    <group name="ollama-torso" ref={torso} position={[0, 1.04, -0.2]}>
      <Solid r={r} scale={[0.42, 0.43, 0.76]} />
      <Solid r={r} finish="belly" position={[0, -0.15, 0.16]} scale={[0.38, 0.29, 0.56]} />
      {[-0.54, -0.28, 0, 0.28, 0.51].flatMap((z, row) => Array.from({ length: 7 }, (_, i) => {
        const angle = i * Math.PI * 2 / 7
        return <Solid key={`${row}-${i}`} r={r} finish={i % 3 ? 'body' : 'belly'} shape="facet" position={[Math.cos(angle) * 0.34, Math.sin(angle) * 0.34, z]} scale={[0.15 + row % 2 * 0.02, 0.16, 0.18]} />
      }))}
      <Solid r={r} finish="frame" shape="ring" rotation={[0, Math.PI / 2, 0]} scale={[0.49, 0.43, 0.49]} />
      {[-1, 1].map((side) => <group key={side} name="ollama-emerald-harness" position={[side * 0.44, 0.04, -0.1]} rotation={[0, side * Math.PI / 2, 0]}>
        <Solid r={r} finish="frame" shape="facet" scale={[0.27, 0.26, 0.08]} />
        <Solid r={r} finish="crystal" shape="crystal" position={[0, 0.02, 0.08]} scale={[0.2, 0.23, 0.08]} />
        <Solid r={r} finish="glow" shape="ring" position={[0, 0, 0.11]} scale={[0.12, 0.12, 0.12]} />
      </group>)}
      {[-0.52, -0.22, 0.08, 0.35].map((z, i) => <Solid key={z} r={r} finish="crystal" shape="crystal" position={[0, 0.41, z]} rotation={[-0.2, 0, 0.1 * (i % 2 ? 1 : -1)]} scale={[0.15, 0.2 + i % 2 * 0.05, 0.15]} />)}
    </group>
    {legs.map((leg, i) => <LlamaLeg key={i} r={r} rig={leg} />)}
    <group name="ollama-neck" ref={neck} position={[0, 1.13, 0.36]}>
      <Solid r={r} finish="body" shape="bone" position={[0, 0.34, 0.05]} rotation={[0.1, 0, 0]} scale={[0.37, 0.85, 0.34]} />
      {Array.from({ length: 4 }, (_, row) => [-1, 0, 1].map((side) => <Solid key={`${row}-${side}`} r={r} finish={side ? 'body' : 'belly'} shape="facet" position={[side * 0.13, 0.07 + row * 0.19, 0.17 + (row % 2) * 0.02]} scale={[0.15, 0.17, 0.13]} />))}
      <Solid r={r} finish="frame" shape="ring" rotation={[Math.PI / 2, 0, 0]} position={[0, 0.25, 0.045]} scale={[0.22, 0.2, 0.22]} />
      <Solid r={r} finish="crystal" shape="crystal" position={[0, 0.22, 0.28]} scale={[0.12, 0.19, 0.07]} />
      <group name="ollama-head" ref={head} position={[0, 0.75, 0.13]}>
        <Solid r={r} finish="body" scale={[0.28, 0.28, 0.31]} />
        <Solid r={r} finish="belly" position={[0, -0.09, 0.29]} scale={[0.205, 0.17, 0.37]} />
        <Solid r={r} finish="inner" position={[0, -0.07, 0.625]} scale={[0.117, 0.082, 0.045]} />
        {[-1, 1].map((side) => <Solid key={side} r={r} finish="frame" position={[side * 0.066, -0.05, 0.66]} scale={[0.018, 0.02, 0.014]} />)}
        <group name="ollama-jaw" ref={jaw} position={[0, -0.17, 0.12]}><Solid r={r} finish="belly" position={[0, -0.025, 0.2]} scale={[0.19, 0.077, 0.32]} /></group>
        <Eyes id="ollama" r={r} pose={pose} separation={0.22} y={0.035} z={0.21} size={0.105} sideTurn={0.45} />
        {[-1, 1].map((side, index) => <group key={side} name={`ollama-ear-${side < 0 ? 'left' : 'right'}`} ref={(node) => { ears.current[index] = node }} position={[side * 0.17, 0.22, -0.07]}>
          <Solid r={r} finish="body" shape="ear" />
          <Solid r={r} finish="inner" shape="ear" position={[0, 0.04, 0.04]} scale={[0.62, 0.84, 0.45]} />
          <Solid r={r} finish="belly" shape="facet" position={[0, 0.025, 0]} scale={[0.115, 0.1, 0.105]} />
        </group>)}
        {[-0.19, 0, 0.19].map((x, i) => <group key={x} position={[x, 0.24, 0.14]}>
          <Solid r={r} finish="belly" shape="facet" scale={[0.14, 0.13, 0.15]} />
          <Solid r={r} finish="crystal" shape="crystal" position={[0, 0.14, -0.04]} rotation={[0, 0, -x]} scale={[0.09, i === 1 ? 0.21 : 0.15, 0.08]} />
        </group>)}
      </group>
    </group>
    <group name="ollama-tail" ref={tail} position={[0, 1.19, -0.93]}>
      <Solid r={r} finish="body" position={[0, 0.01, -0.11]} scale={[0.1, 0.11, 0.22]} />
      <Solid r={r} finish="belly" shape="facet" position={[0, 0.015, -0.29]} scale={[0.15, 0.17, 0.18]} />
      <Solid r={r} finish="body" shape="facet" position={[0.035, 0.04, -0.4]} scale={[0.1, 0.11, 0.1]} />
    </group>
  </group>
}

/** Separate anatomical rigs and palettes; neither species is a reskinned wolf. */
export function AquaticFamiliar({ id, pose, detail }: { id: AquaticId; pose: MutableRefObject<FamiliarPose>; detail: number }) {
  return id === 'deepseek' ? <DeepSeekWhale pose={pose} detail={detail} /> : <OllamaLlama pose={pose} detail={detail} />
}
