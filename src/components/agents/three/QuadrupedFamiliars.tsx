import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group,
  IcosahedronGeometry, MeshStandardMaterial, OctahedronGeometry, SphereGeometry, TorusGeometry,
} from 'three'
import type { FamiliarPose } from '@/lib/familiarAnimation'

type FamiliarId = 'gemini' | 'cursor' | 'grok'
type V3 = [number, number, number]
type Finish = 'core' | 'joint' | 'shell' | 'armor' | 'crystal' | 'glow' | 'accent' | 'face'
const SPECS = {
  gemini: { hipY: 1.19, headY: 1.91, upper: 0.53, lower: 0.57, width: 0.31, headScale: [0.345, 0.31, 0.36] as V3, bodyScale: [0.35, 0.36, 0.77] as V3, eyeX: 0.235, eyeZ: 0.34, color: '#4c3bcb', crystal: '#8476ff', emission: '#6850ff', glow: '#ae94ff', accent: '#63eaff' },
  cursor: { hipY: 1.12, headY: 1.76, upper: 0.5, lower: 0.54, width: 0.33, headScale: [0.415, 0.36, 0.34] as V3, bodyScale: [0.39, 0.37, 0.77] as V3, eyeX: 0.266, eyeZ: 0.32, color: '#472a80', crystal: '#a55dff', emission: '#9d38f4', glow: '#e4a5ff', accent: '#70edff' },
  grok: { hipY: 1.23, headY: 1.94, upper: 0.55, lower: 0.58, width: 0.33, headScale: [0.345, 0.3, 0.43] as V3, bodyScale: [0.35, 0.36, 0.83] as V3, eyeX: 0.235, eyeZ: 0.445, color: '#16594e', crystal: '#29c98b', emission: '#09aa63', glow: '#79ffbf', accent: '#84ffd1' },
} as const

/** Closed polygonal solid, including rear and side walls; not a decal or plane. */
function plateGeometry(outline: Array<[number, number]>, depth = 0.07, ridge = 0.08) {
  const vertices: number[] = []
  const triangle = (a: V3, b: V3, c: V3) => vertices.push(...a, ...b, ...c)
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length]
    const af: V3 = [a[0], a[1], depth], bf: V3 = [b[0], b[1], depth]
    const ab: V3 = [a[0], a[1], -depth], bb: V3 = [b[0], b[1], -depth]
    triangle([0, 0.05, depth + ridge], af, bf); triangle([0, 0.05, -depth], bb, ab)
    triangle(af, ab, bb); triangle(af, bb, bf)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals()
  return geometry
}

function resourcesFor(id: FamiliarId, detail: number) {
  const spec = SPECS[id]
  const geometry = {
    facet: new IcosahedronGeometry(1, detail >= 2 ? 2 : 1),
    smooth: new SphereGeometry(1, detail >= 2 ? 20 : 14, detail >= 2 ? 12 : 8),
    box: new BoxGeometry(1, 1, 1), bone: new CylinderGeometry(0.5, 0.44, 1, 6),
    disc: new CylinderGeometry(1, 1, 1, detail >= 2 ? 20 : 12), gem: new OctahedronGeometry(1),
    ring: new TorusGeometry(1, 0.07, 6, detail >= 2 ? 36 : 24),
    plate: plateGeometry([[0, 0.6], [-0.44, 0.2], [-0.3, -0.4], [0, -0.6], [0.3, -0.4], [0.44, 0.2]]),
    blade: plateGeometry([[0, 0.82], [-0.31, 0.06], [-0.15, -0.4], [0.29, -0.18]], 0.065, 0.09),
    foxEar: plateGeometry([[0, 1], [-0.44, 0.1], [-0.3, -0.07], [0.3, -0.07], [0.44, 0.1]], 0.06, 0.07),
    catEar: plateGeometry([[0, 0.9], [-0.13, 0.81], [-0.39, 0.17], [-0.32, -0.04], [0.32, -0.04], [0.39, 0.17], [0.13, 0.81]], 0.07, 0.065),
    upperLid: new SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    lowerLid: new SphereGeometry(1, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  }
  const material: Record<Finish, MeshStandardMaterial> = {
    core: new MeshStandardMaterial({ color: id === 'cursor' ? '#100d26' : '#091626', metalness: 0.38, roughness: 0.33 }),
    joint: new MeshStandardMaterial({ color: '#26324b', metalness: 0.64, roughness: 0.32 }),
    shell: new MeshStandardMaterial({ color: id === 'gemini' ? '#d9ddff' : id === 'cursor' ? '#a497d3' : '#e4f3ee', metalness: 0.32, roughness: 0.29, flatShading: true }),
    armor: new MeshStandardMaterial({ color: spec.color, metalness: 0.46, roughness: 0.26, flatShading: id !== 'cursor' }),
    crystal: new MeshStandardMaterial({ color: spec.crystal, emissive: spec.emission, emissiveIntensity: 0.3, metalness: 0.28, roughness: 0.18, flatShading: true }),
    glow: new MeshStandardMaterial({ color: spec.glow, emissive: spec.glow, emissiveIntensity: 1.1, roughness: 0.22, toneMapped: false }),
    accent: new MeshStandardMaterial({ color: spec.accent, emissive: spec.accent, emissiveIntensity: 0.9, roughness: 0.2, toneMapped: false }),
    face: new MeshStandardMaterial({ color: id === 'cursor' ? '#100921' : '#030e19', metalness: 0.25, roughness: 0.18 }),
  }
  return { geometry, material }
}
type Resources = ReturnType<typeof resourcesFor>

function Part({ r, shape = 'facet', finish = 'shell', position, rotation, scale, name }: {
  r: Resources; shape?: keyof Resources['geometry']; finish?: Finish; position?: V3; rotation?: V3; scale?: V3; name?: string
}) {
  return <mesh name={name} geometry={r.geometry[shape]} material={r.material[finish]} position={position} rotation={rotation} scale={scale} castShadow receiveShadow />
}

interface Leg { upper: Group | null; lower: Group | null; paw: Group | null; side: number; front: boolean }

function LegAssembly({ id, r, leg }: { id: FamiliarId; r: Resources; leg: Leg }) {
  const s = SPECS[id], cat = id === 'cursor'
  const label = `${id}-leg-${leg.front ? 'front' : 'rear'}-${leg.side < 0 ? 'left' : 'right'}`
  return <group name={label} position={[leg.side * s.width, s.hipY, leg.front ? 0.47 : -0.59]}>
    <group name={`${label}-hip`} ref={(g) => { leg.upper = g }}>
      <Part r={r} shape={cat ? 'smooth' : 'facet'} finish="core" scale={[leg.front ? 0.17 : 0.22, 0.23, 0.23]} />
      <Part r={r} shape={cat ? 'smooth' : 'plate'} finish={id === 'grok' ? 'shell' : 'armor'} position={[leg.side * 0.12, -0.07, 0]} rotation={cat ? undefined : [0, leg.side * Math.PI / 2, 0]} scale={cat ? [0.14, 0.22, 0.23] : [0.4, 0.46, 0.32]} />
      <Part r={r} shape="gem" finish={id === 'cursor' ? 'glow' : 'accent'} position={[leg.side * 0.23, -0.015, 0.035]} rotation={[0, leg.side * Math.PI / 2, 0]} scale={[0.055, 0.085, 0.035]} />
      <Part r={r} shape="bone" finish="core" position={[0, -s.upper / 2, 0]} scale={[0.14, s.upper, 0.14]} />
      <Part r={r} shape={cat ? 'smooth' : 'facet'} finish={id === 'gemini' ? 'shell' : 'armor'} position={[0, -s.upper * 0.54, 0.02]} scale={[0.105, s.upper * 0.47, 0.12]} />
      <group name={`${label}-knee`} ref={(g) => { leg.lower = g }} position={[0, -s.upper, 0]}>
        <Part r={r} shape="smooth" finish="joint" scale={[0.1, 0.1, 0.105]} />
        <Part r={r} shape="bone" finish="core" position={[0, -s.lower / 2, 0]} scale={[0.12, s.lower, 0.12]} />
        <Part r={r} finish={id === 'grok' ? 'shell' : cat ? 'armor' : 'crystal'} position={[0, -s.lower * 0.42, 0.04]} scale={[0.1, s.lower * 0.43, 0.115]} />
        <Part r={r} shape="box" finish="glow" position={[0, -s.lower * 0.4, 0.144]} scale={[0.02, 0.16, 0.013]} />
        <group name={`${label}-paw`} ref={(g) => { leg.paw = g }} position={[0, -s.lower, 0]}>
          <Part r={r} shape={cat ? 'smooth' : 'facet'} finish="core" position={[0, -0.025, 0.06]} scale={[cat ? 0.175 : 0.14, 0.105, cat ? 0.18 : 0.2]} />
          <Part r={r} shape={cat ? 'smooth' : 'facet'} finish={id === 'cursor' ? 'armor' : 'shell'} position={[0, 0.015, 0.095]} scale={[cat ? 0.17 : 0.14, 0.08, 0.17]} />
          {(cat ? [-1.5, -0.5, 0.5, 1.5] : [-1, 0, 1]).map((toe) => <Part key={toe} r={r} shape={cat ? 'smooth' : 'facet'} finish={cat ? 'crystal' : 'shell'} position={[toe * (cat ? 0.075 : 0.095), -0.035, 0.215]} scale={[0.052, 0.057, cat ? 0.073 : 0.09]} />)}
        </group>
      </group>
    </group>
  </group>
}

function positionLeg(leg: Leg, id: FamiliarId, drop: number, pose: FamiliarPose) {
  if (!leg.upper || !leg.lower || !leg.paw) return
  const s = SPECS[id], phase = pose.time * (id === 'cursor' ? 5.4 : 5) + (leg.side > 0 ? Math.PI : 0) + (leg.front ? 0 : Math.PI)
  const lift = Math.max(0, Math.sin(phase)) * pose.stride * 0.135
  const z = -Math.cos(phase) * pose.stride * 0.17 + (leg.front ? 0.035 : -0.04)
  const height = s.hipY + drop - 0.135 - lift
  const distance = Math.max(0.1, Math.min(s.upper + s.lower - 0.007, Math.hypot(height, z)))
  const bounded = (n: number) => Math.max(-1, Math.min(1, n))
  const alpha = Math.acos(bounded((s.upper * s.upper + distance * distance - s.lower * s.lower) / (2 * s.upper * distance)))
  const knee = Math.PI - Math.acos(bounded((s.upper * s.upper + s.lower * s.lower - distance * distance) / (2 * s.upper * s.lower)))
  const sign = leg.front ? 1 : -1
  leg.upper.rotation.x = Math.atan2(-z, height) + sign * alpha
  leg.lower.rotation.x = -sign * knee
  leg.paw.rotation.x = -(leg.upper.rotation.x + leg.lower.rotation.x)
}

function FoxPlume({ id, r, branch, joints }: { id: 'gemini' | 'grok'; r: Resources; branch: number; joints: MutableRefObject<Array<Group | null>> }) {
  const gemini = id === 'gemini', side = branch === 0 ? -1 : 1, offset = branch * 3
  return <group name={`${id}-tail-${offset}`} ref={(g) => { joints.current[offset] = g }} position={[gemini ? side * 0.12 : 0, 1.35, -0.75]}>
    <Part r={r} finish={gemini ? 'armor' : 'core'} position={[0, 0, -0.24]} scale={[gemini ? 0.17 : 0.21, gemini ? 0.17 : 0.2, 0.36]} />
    <Part r={r} shape="blade" finish={gemini ? 'crystal' : 'shell'} position={[0, 0.12, -0.21]} rotation={[-Math.PI / 2, 0, 0]} scale={[gemini ? 0.46 : 0.56, 0.48, 0.5]} />
    <group name={`${id}-tail-${offset + 1}`} ref={(g) => { joints.current[offset + 1] = g }} position={[0, 0, -0.43]}>
      <Part r={r} finish={gemini ? 'crystal' : 'armor'} position={[0, 0, -0.22]} scale={[gemini ? 0.2 : 0.245, gemini ? 0.21 : 0.22, 0.35]} />
      {[-1, 1].map((flank) => <Part key={flank} r={r} shape="blade" finish="shell" position={[flank * 0.11, 0.07, -0.22]} rotation={[-Math.PI / 2, flank * 0.24, -flank * 0.32]} scale={[0.3, 0.54, 0.34]} />)}
      <group name={`${id}-tail-${offset + 2}`} ref={(g) => { joints.current[offset + 2] = g }} position={[0, 0, -0.43]}>
        <Part r={r} finish="shell" position={[0, 0, -0.18]} scale={[0.155, 0.17, 0.29]} />
        <Part r={r} shape="blade" finish="crystal" position={[0, 0.035, -0.31]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.34, 0.5, 0.34]} />
        <Part r={r} shape="gem" finish={gemini ? 'accent' : 'glow'} position={[0, 0.1, -0.21]} scale={[0.05, 0.08, 0.15]} />
      </group>
    </group>
  </group>
}

function CatTail({ r, joints }: { r: Resources; joints: MutableRefObject<Array<Group | null>> }) {
  const segment = (index: number, length: number, children?: ReactNode) => <group name={`cursor-tail-${index}`} ref={(g) => { joints.current[index] = g }} position={index === 0 ? [0, 1.25, -0.76] : [0, 0, -(index === 1 ? 0.42 : index === 2 ? 0.4 : 0.36)]}>
    <Part r={r} shape="smooth" finish="core" position={[0, 0, -length * 0.47]} scale={[0.105 - index * 0.009, 0.11 - index * 0.01, length * 0.65]} />
    <Part r={r} finish="armor" position={[0, 0.065, -length * 0.5]} scale={[0.09, 0.065, length * 0.48]} />
    <Part r={r} shape="ring" finish="glow" position={[0, 0, -length * 0.32]} scale={[0.098 - index * 0.007, 0.098 - index * 0.007, 0.098]} />
    {children}
  </group>
  return segment(0, 0.42, segment(1, 0.4, segment(2, 0.36, segment(3, 0.33, <Part r={r} shape="gem" finish="crystal" position={[0, 0, -0.35]} scale={[0.125, 0.14, 0.24]} />))))
}

/** Three distinct procedural quadruped rigs: a twin-tail crystal fox, a cat and a visor fox. */
export function QuadrupedFamiliar({ id, pose, detail }: { id: FamiliarId; pose: MutableRefObject<FamiliarPose>; detail: number }) {
  const quality = Math.max(0, Math.min(2, Math.floor(detail))), cat = id === 'cursor', gemini = id === 'gemini', grok = id === 'grok'
  const r = useMemo(() => resourcesFor(id, quality), [id, quality]), s = SPECS[id]
  const root = useRef<Group>(null), chest = useRef<Group>(null), head = useRef<Group>(null), jaw = useRef<Group>(null), orbit = useRef<Group>(null)
  const ears = useRef<Array<Group | null>>([]), lids = useRef<Array<Group | null>>([]), brows = useRef<Array<Group | null>>([]), tail = useRef<Array<Group | null>>([])
  const legs = useMemo<Leg[]>(() => [-1, 1].flatMap((side) => [true, false].map((front) => ({ side, front, upper: null, lower: null, paw: null }))), [])
  useEffect(() => () => { Object.values(r.geometry).forEach((g) => g.dispose()); Object.values(r.material).forEach((m) => m.dispose()) }, [r])

  useFrame(() => {
    const p = pose.current, energy = Math.max(0, Math.min(1, p.energy)), drop = -p.crouch * (cat ? 0.22 : 0.26)
    r.material.glow.emissiveIntensity = 0.18 + energy * 2.4
    r.material.accent.emissiveIntensity = 0.16 + energy * 1.8
    r.material.crystal.emissiveIntensity = 0.1 + energy * 0.6
    if (root.current) { root.current.position.y = drop; root.current.rotation.z = p.stride * Math.sin(p.time * 5) * 0.01 }
    if (chest.current) chest.current.scale.set(1 + p.breathe * 0.55, 1 + p.breathe, 1 + p.breathe * 0.35)
    if (head.current) { head.current.rotation.y = p.headYaw; head.current.rotation.x = p.headPitch; head.current.rotation.z = -p.mood * (cat ? 0.035 : 0.02) }
    if (jaw.current) jaw.current.rotation.x = Math.max(0, energy - 0.6) * 0.2 + Math.max(0, -p.mood) * 0.03
    ears.current.forEach((ear, index) => { if (!ear) return; const side = index === 0 ? -1 : 1, angle = index === 0 ? p.earLeft : p.earRight; ear.rotation.z = -side * (gemini ? 0.72 : cat ? 0.22 : 0.13) - side * angle * (gemini ? 0.55 : 0.7); ear.rotation.x = -0.1 + angle * 0.3 })
    const blink = Math.max(0, Math.min(1, p.blink))
    lids.current.forEach((lid, index) => { if (!lid) return; lid.visible = blink > 0.002; lid.position.y = (index % 2 ? -1 : 1) * (cat ? 0.165 : 0.15) * (1 - blink); lid.scale.y = Math.max(0.002, blink) })
    brows.current.forEach((brow, index) => { if (brow) brow.rotation.z = (index ? 1 : -1) * (0.08 + p.focus * (grok ? 0.17 : 0.1) - p.mood * 0.05) })
    legs.forEach((leg) => positionLeg(leg, id, drop, p))
    tail.current.forEach((joint, index) => {
      if (!joint) return
      if (cat) { joint.rotation.x = [0.35, 0.4, 0.42, 0.4][index] + p.mood * 0.06; joint.rotation.y = p.tail * (0.7 - index * 0.12); joint.rotation.z = index === 0 ? 0.13 : 0 }
      else { const branch = index >= 3 ? 1 : -1, segment = index % 3; joint.rotation.y = (gemini && segment === 0 ? branch * 0.32 : 0) + p.tail * (1 - segment * 0.2) * (gemini ? (branch === -1 ? 0.75 : 1) : 0.9); joint.rotation.x = (gemini ? [0.16, 0.15, 0.15][segment] : [-0.25, 0.1, 0.12][segment]) + p.mood * 0.09; joint.rotation.z = gemini && segment === 0 ? branch * 0.16 : 0 }
    })
    if (orbit.current) orbit.current.rotation.y = p.time * 0.2 * energy
  })

  return <group name={`familiar-${id}`} ref={root} dispose={null}>
    <group name={`${id}-chest`} ref={chest} position={[0, cat ? 1.19 : 1.31, 0]}>
      <Part r={r} shape={cat ? 'smooth' : 'facet'} finish="core" scale={s.bodyScale} />
      <Part r={r} shape={cat ? 'smooth' : 'facet'} finish="armor" position={[0, 0.12, -0.22]} scale={[s.bodyScale[0] * 0.95, 0.27, 0.55]} />
      {cat ? <>
        {[-0.47, -0.05, 0.35].map((z) => <Part key={z} r={r} shape="ring" finish="crystal" position={[0, 0.02, z]} scale={[0.395, 0.36, 0.25]} />)}
        <Part r={r} shape="smooth" finish="armor" position={[0, 0.02, 0.43]} scale={[0.32, 0.34, 0.34]} />
      </> : <>
        {[-0.43, -0.05, 0.32].map((z, index) => <Part key={z} r={r} shape="plate" finish={grok ? 'shell' : index === 1 ? 'crystal' : 'armor'} position={[0, 0.29, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.61, 0.4, 0.36]} />)}
        {[-1, 1].map((side) => [-0.31, 0.18].map((z) => <Part key={`${side}-${z}`} r={r} shape="plate" finish={grok ? 'shell' : 'armor'} position={[side * 0.31, -0.01, z]} rotation={[0, side * Math.PI / 2, -side * 0.12]} scale={[0.42, 0.52, 0.3]} />))}
      </>}
      <Part r={r} shape="plate" finish="shell" position={[0, -0.06, 0.61]} scale={[cat ? 0.46 : 0.5, 0.58, 0.4]} />
      <Part name={`${id}-chest-gem`} r={r} shape="gem" finish={cat ? 'accent' : 'glow'} position={[0, 0.03, 0.735]} scale={[0.115, 0.18, 0.08]} />
      {grok && [-1, 0, 1].map((port) => <Part key={port} r={r} shape="box" finish="glow" position={[port * 0.09, 0.27, 0.69]} scale={[0.04, 0.035, 0.02]} />)}
    </group>
    {legs.map((leg) => <LegAssembly key={`${leg.side}-${leg.front}`} id={id} r={r} leg={leg} />)}

    <group name={`${id}-neck`} position={[0, cat ? 1.39 : 1.48, 0.53]}>
      <Part r={r} finish="core" scale={[cat ? 0.25 : 0.23, cat ? 0.28 : 0.34, 0.26]} position={[0, 0.13, 0.06]} />
      <Part r={r} shape="plate" finish={cat ? 'armor' : 'shell'} position={[0, 0.16, 0.29]} rotation={[-0.25, 0, 0]} scale={[0.43, 0.5, 0.31]} />
      {gemini && [-1, 1].map((side) => <Part key={side} r={r} shape="blade" finish="crystal" position={[side * 0.24, 0.22, 0.01]} rotation={[-0.4, 0, -side * 0.85]} scale={[0.3, 0.45, 0.35]} />)}
    </group>

    <group name={`${id}-head`} ref={head} position={[0, s.headY, cat ? 0.77 : 0.84]}>
      <Part r={r} shape={cat ? 'smooth' : 'facet'} finish={grok ? 'shell' : 'armor'} scale={s.headScale} />
      <Part name={`${id}-face-shell`} r={r} shape="smooth" finish="face" position={[0, 0.025, cat ? 0.17 : 0.22]} scale={[cat ? 0.375 : 0.31, cat ? 0.285 : 0.25, cat ? 0.245 : 0.3]} />
      {grok && <Part r={r} finish="face" position={[0, 0.055, 0.33]} scale={[0.33, 0.16, 0.21]} />}
      {gemini && <Part r={r} shape="blade" finish="accent" position={[0, 0.27, -0.04]} rotation={[-0.25, 0, 0]} scale={[0.2, 0.45, 0.22]} />}
      {cat && <Part r={r} shape="box" finish="crystal" position={[0, 0.31, 0.07]} rotation={[-0.45, 0, 0]} scale={[0.035, 0.07, 0.3]} />}
      {[-1, 1].map((side, index) => <group key={`face-${side}`}>
        {!cat && <Part r={r} shape="blade" finish="shell" position={[side * 0.29, -0.015, 0.02]} rotation={[-0.3, side * 1.1, -side * 0.65]} scale={[0.32, gemini ? 0.55 : 0.45, 0.35]} />}
        <group name={`${id}-eye-${side < 0 ? 'left' : 'right'}`} position={[side * s.eyeX, 0.06, s.eyeZ]} rotation={[0, side * 0.47, side * (grok ? -0.035 : 0.015)]}>
          <Part r={r} shape="smooth" finish="face" scale={[cat ? 0.147 : 0.135, cat ? 0.175 : 0.16, 0.045]} />
          <Part r={r} shape="smooth" finish="crystal" position={[0, 0, 0.025]} scale={[0.105, cat ? 0.14 : 0.125, 0.034]} />
          <Part name={`${id}-eye-${side < 0 ? 'left' : 'right'}-iris`} r={r} shape="smooth" finish={gemini ? 'accent' : 'glow'} position={[0, 0, 0.054]} scale={[cat ? 0.07 : 0.067, cat ? 0.105 : 0.095, 0.018]} />
          <Part r={r} shape="smooth" finish="face" position={[0.012, 0, 0.07]} scale={[cat ? 0.011 : 0.016, 0.078, 0.01]} />
          <Part r={r} shape="smooth" finish="shell" position={[-0.024, 0.046, 0.074]} scale={[0.019, 0.029, 0.008]} />
          <group name={`${id}-eye-${side < 0 ? 'left' : 'right'}-upper-lid`} ref={(g) => { lids.current[index * 2] = g }}><Part r={r} shape="upperLid" finish="face" scale={[0.15, cat ? 0.18 : 0.165, 0.087]} /></group>
          <group name={`${id}-eye-${side < 0 ? 'left' : 'right'}-lower-lid`} ref={(g) => { lids.current[index * 2 + 1] = g }}><Part r={r} shape="lowerLid" finish="face" scale={[0.15, cat ? 0.18 : 0.165, 0.087]} /></group>
          <group name={`${id}-eye-${side < 0 ? 'left' : 'right'}-brow`} ref={(g) => { brows.current[index] = g }} position={[0, cat ? 0.155 : 0.14, 0.01]}><Part r={r} shape="box" finish={grok ? 'crystal' : 'shell'} scale={[0.22, 0.035, 0.055]} /></group>
        </group>
      </group>)}
      <Part r={r} shape={cat ? 'smooth' : 'facet'} finish="shell" position={[0, -0.14, cat ? 0.345 : 0.43]} scale={cat ? [0.29, 0.12, 0.165] : [0.19, 0.13, grok ? 0.34 : 0.29]} />
      <Part r={r} finish="face" position={[0, -0.09, cat ? 0.475 : grok ? 0.74 : 0.69]} scale={cat ? [0.074, 0.055, 0.06] : [0.095, 0.07, 0.075]} />
      <group name={`${id}-jaw`} ref={jaw} position={[0, -0.2, cat ? 0.23 : 0.25]}><Part r={r} finish="face" position={[0, -0.02, cat ? 0.13 : 0.21]} scale={cat ? [0.225, 0.045, 0.17] : [0.165, 0.055, 0.26]} /><Part r={r} finish="shell" position={[0, -0.052, cat ? 0.13 : 0.21]} scale={cat ? [0.23, 0.05, 0.17] : [0.17, 0.055, 0.27]} /></group>

      {[-1, 1].map((side, index) => <group name={`${id}-ear-${side < 0 ? 'left' : 'right'}`} key={`ear-${side}`} ref={(g) => { ears.current[index] = g }} position={[side * (cat ? 0.285 : 0.23), cat ? 0.26 : 0.23, -0.025]}>
        <Part r={r} shape={cat ? 'catEar' : 'foxEar'} finish={cat ? 'core' : 'shell'} scale={cat ? [0.52, 0.5, 0.6] : gemini ? [0.64, 0.78, 0.62] : [0.51, 0.64, 0.54]} />
        <Part r={r} shape={cat ? 'catEar' : 'foxEar'} finish={cat || gemini ? 'crystal' : 'face'} position={[0, 0.055, 0.07]} scale={cat ? [0.36, 0.37, 0.4] : gemini ? [0.49, 0.6, 0.4] : [0.36, 0.49, 0.35]} />
        {gemini && <Part r={r} shape="blade" finish="accent" position={[0, 0.27, 0.12]} scale={[0.15, 0.39, 0.23]} />}
        {grok && [-1, 0, 1].map((dot) => <Part key={dot} r={r} shape="gem" finish="glow" position={[dot * 0.075, 0.08, 0.11]} scale={[0.027, 0.035, 0.02]} />)}
      </group>)}
      {cat && [-1, 1].map((side) => <group key={`cat-detail-${side}`}>
        <Part r={r} shape="disc" finish="armor" position={[side * 0.36, 0.1, -0.02]} rotation={[0, 0, Math.PI / 2]} scale={[0.19, 0.09, 0.19]} />
        <Part r={r} shape="ring" finish="glow" position={[side * 0.415, 0.1, -0.02]} rotation={[0, Math.PI / 2, 0]} scale={[0.16, 0.16, 0.16]} />
        <Part r={r} shape="gem" finish="crystal" position={[side * 0.43, 0.1, -0.02]} scale={[0.045, 0.09, 0.09]} />
        {[-1, 0, 1].map((strand) => <Part key={strand} r={r} shape="box" finish="crystal" position={[side * 0.385, -0.12 + strand * 0.055, 0.385]} rotation={[0, side * -0.13, side * strand * 0.16]} scale={[0.33, 0.012, 0.012]} />)}
      </group>)}
    </group>

    {gemini && <group name="gemini-orbital-gem" ref={orbit} position={[0, 1.55, 0.39]}>
      <Part r={r} shape="ring" finish="crystal" rotation={[Math.PI / 2, 0.12, 0.15]} scale={[0.42, 0.3, 0.42]} />
      <Part r={r} shape="gem" finish="accent" position={[0.39, 0.02, 0]} scale={[0.07, 0.14, 0.07]} />
      <Part r={r} shape="gem" finish="crystal" position={[-0.39, -0.02, 0]} scale={[0.06, 0.12, 0.06]} />
    </group>}
    {cat ? <CatTail r={r} joints={tail} /> : gemini ? <><FoxPlume id="gemini" r={r} branch={0} joints={tail} /><FoxPlume id="gemini" r={r} branch={1} joints={tail} /></> : <FoxPlume id="grok" r={r} branch={0} joints={tail} />}
  </group>
}
