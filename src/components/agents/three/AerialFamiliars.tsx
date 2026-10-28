import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, SphereGeometry,
  CylinderGeometry, OctahedronGeometry, ConeGeometry, TorusGeometry, MeshStandardMaterial,
  Quaternion, Vector3,
} from 'three'
import type { FamiliarPose } from '@/lib/familiarAnimation'

type V3 = [number, number, number]
type Finish = 'dark' | 'gold' | 'lightGold' | 'cream' | 'glow' | 'glass' | 'ember' | 'red' | 'hot'

/** Raised front and back facets, with every outline edge closed by a solid wall. */
function closedLeaf(outline: Array<[number, number]>, depth: number, ridge: number) {
  const points: number[] = []
  const area = outline.reduce((sum, a, i) => { const b = outline[(i + 1) % outline.length]; return sum + a[0] * b[1] - b[0] * a[1] }, 0)
  const edge = area < 0 ? [...outline].reverse() : outline
  const triangle = (a: V3, b: V3, c: V3) => points.push(...a, ...b, ...c)
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i], b = edge[(i + 1) % edge.length]
    const af: V3 = [a[0], a[1], depth], bf: V3 = [b[0], b[1], depth]
    const ab: V3 = [a[0], a[1], -depth], bb: V3 = [b[0], b[1], -depth]
    triangle([0, 0.3, depth + ridge], af, bf)
    triangle([0, 0.3, -depth], bb, ab)
    triangle(af, ab, bb); triangle(af, bb, bf)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
  geometry.computeVertexNormals()
  return geometry
}

function createResources(detail: number) {
  const geometries = {
    facet: new IcosahedronGeometry(1, detail > 1 ? 2 : 1),
    sphere: new SphereGeometry(1, detail > 1 ? 22 : 14, detail > 1 ? 16 : 10),
    rod: new CylinderGeometry(1, 1, 1, detail > 1 ? 8 : 6, 1, false),
    gem: new OctahedronGeometry(1),
    cone: new ConeGeometry(1, 1, 5, 1, false),
    ring: new TorusGeometry(1, 0.13, 6, detail > 1 ? 36 : 24),
    hex: new TorusGeometry(1, 0.14, 5, 6),
    wing: closedLeaf([[0, -0.12], [-0.21, 0.05], [-0.43, 0.6], [-0.27, 1.08], [0.03, 1.25], [0.32, 0.95], [0.38, 0.36], [0.17, -0.02]], 0.035, 0.06),
    feather: closedLeaf([[0, -0.1], [-0.36, 0.02], [-0.5, 0.3], [-0.35, 0.72], [0, 1.15], [0.24, 0.94], [0.5, 0.43], [0.24, 0.08]], 0.075, 0.10),
    lid: closedLeaf([[-0.95, 0], [-0.82, 0.6], [-0.45, 0.92], [0, 1], [0.6, 0.85], [0.92, 0.35], [0.95, 0]], 0.08, 0.02),
  }
  const materials: Record<Finish, MeshStandardMaterial> = {
    dark: new MeshStandardMaterial({ color: '#17101c', metalness: 0.6, roughness: 0.34, flatShading: true }),
    gold: new MeshStandardMaterial({ color: '#efaa2d', emissive: '#6b3100', emissiveIntensity: 0.18, metalness: 0.68, roughness: 0.27, flatShading: true }),
    lightGold: new MeshStandardMaterial({ color: '#ffdc84', emissive: '#ff9a1c', emissiveIntensity: 0.35, metalness: 0.44, roughness: 0.28, flatShading: true }),
    cream: new MeshStandardMaterial({ color: '#fff1c7', metalness: 0.25, roughness: 0.36, flatShading: true }),
    glow: new MeshStandardMaterial({ color: '#fff7b0', emissive: '#ffc342', emissiveIntensity: 2.8, roughness: 0.2, toneMapped: false }),
    glass: new MeshStandardMaterial({ color: '#fff0b8', emissive: '#c57c1c', emissiveIntensity: 0.3, transparent: true, opacity: 0.42, depthWrite: false, metalness: 0.18, roughness: 0.16, flatShading: true }),
    ember: new MeshStandardMaterial({ color: '#ff821e', emissive: '#e63a08', emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.32, flatShading: true }),
    red: new MeshStandardMaterial({ color: '#9a2427', emissive: '#6c0c13', emissiveIntensity: 0.24, metalness: 0.5, roughness: 0.3, flatShading: true }),
    hot: new MeshStandardMaterial({ color: '#ffdf70', emissive: '#ff7d17', emissiveIntensity: 1.35, metalness: 0.25, roughness: 0.26, flatShading: true }),
  }
  return { geometries, materials }
}
type Resources = ReturnType<typeof createResources>
type Shape = keyof Resources['geometries']

function Solid({ resources, finish, shape = 'facet', position, rotation, scale, name }: {
  resources: Resources; finish: Finish; shape?: Shape; position?: V3; rotation?: V3; scale?: V3; name?: string
}) {
  return <mesh name={name} geometry={resources.geometries[shape]} material={resources.materials[finish]} position={position} rotation={rotation} scale={scale} castShadow={finish !== 'glass'} receiveShadow={finish !== 'glow' && finish !== 'glass'} />
}

function Segment({ resources, from, to, radius, finish = 'gold' }: {
  resources: Resources; from: V3; to: V3; radius: number; finish?: Finish
}) {
  const transform = useMemo(() => {
    const start = new Vector3(...from), end = new Vector3(...to), direction = end.clone().sub(start)
    return { position: start.add(end).multiplyScalar(0.5), rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize()), length: direction.length() }
  }, [from[0], from[1], from[2], to[0], to[1], to[2]])
  return <mesh geometry={resources.geometries.rod} material={resources.materials[finish]} position={transform.position} quaternion={transform.rotation} scale={[radius, transform.length, radius]} castShadow />
}

function Eye({ resources, side, lids, index, bee = false }: { resources: Resources; side: number; lids: MutableRefObject<Array<Group | null>>; index: number; bee?: boolean }) {
  return <group name={`${bee ? 'hq' : 'claude'}-eye-${side < 0 ? 'left' : 'right'}`} position={[side * (bee ? 0.22 : 0.17), bee ? 0.035 : 0.065, bee ? 0.35 : 0.18]} rotation={[0, side * 0.35, 0]}>
    <Solid resources={resources} finish="dark" shape="sphere" scale={[bee ? 0.16 : 0.105, bee ? 0.20 : 0.135, 0.07]} />
    <Solid resources={resources} finish={bee ? 'gold' : 'ember'} shape="sphere" position={[0, 0, 0.045]} scale={[bee ? 0.124 : 0.082, bee ? 0.16 : 0.104, 0.04]} />
    <Solid resources={resources} finish="glow" shape="sphere" position={[0, -0.003, 0.074]} scale={[bee ? 0.083 : 0.058, bee ? 0.124 : 0.08, 0.02]} />
    <Solid resources={resources} finish="dark" shape="sphere" position={[side * 0.009, -0.007, 0.09]} scale={[0.018, bee ? 0.095 : 0.062, 0.011]} />
    <Solid resources={resources} finish="cream" shape="sphere" position={[-0.023, 0.042, 0.09]} scale={[0.019, 0.027, 0.009]} />
    {[1, -1].map((sign, n) => <group key={sign} name={`${bee ? 'hq' : 'claude'}-eyelid-${side}-${sign}`} ref={(node) => { lids.current[index * 2 + n] = node }} rotation={[0, 0, sign < 0 ? Math.PI : 0]} position={[0, 0, 0.105]}>
      <Solid resources={resources} finish={bee ? 'dark' : 'gold'} shape="lid" scale={[bee ? 0.17 : 0.112, bee ? 0.20 : 0.136, 0.25]} />
    </group>)}
  </group>
}

function updateEyes(lids: Array<Group | null>, blink: number) {
  const amount = Math.max(0, Math.min(1, blink))
  for (const lid of lids) if (lid) { lid.visible = amount > 0.003; lid.scale.y = Math.max(0.002, amount) }
}

interface BeeLeg { upper: Group | null; lower: Group | null; foot: Group | null; side: number; index: number }
function BeeLegMesh({ resources, rig }: { resources: Resources; rig: BeeLeg }) {
  return <group name={`hq-leg-${rig.side < 0 ? 'left' : 'right'}-${rig.index}`} position={[rig.side * 0.34, 1.05, 0.37 - rig.index * 0.37]}>
    <group ref={(node) => { rig.upper = node }} name={`hq-leg-${rig.side}-${rig.index}-hip`}>
      <Solid resources={resources} finish="gold" shape="sphere" scale={[0.10, 0.10, 0.10]} />
      <Solid resources={resources} finish="dark" shape="rod" position={[0, -0.24, 0]} scale={[0.047, 0.48, 0.047]} />
      <Solid resources={resources} finish="lightGold" position={[0, -0.17, 0]} scale={[0.072, 0.17, 0.075]} />
      <group ref={(node) => { rig.lower = node }} position={[0, -0.48, 0]} name={`hq-leg-${rig.side}-${rig.index}-knee`}>
        <Solid resources={resources} finish="gold" shape="sphere" scale={[0.075, 0.075, 0.075]} />
        <Solid resources={resources} finish="dark" shape="rod" position={[0, -0.29, 0]} scale={[0.034, 0.58, 0.034]} />
        <Solid resources={resources} finish="gold" position={[0, -0.36, 0.012]} scale={[0.049, 0.17, 0.05]} />
        <group ref={(node) => { rig.foot = node }} position={[0, -0.58, 0]} name={`hq-leg-${rig.side}-${rig.index}-foot`}>
          <Solid resources={resources} finish="dark" position={[0, -0.025, 0.06]} scale={[0.095, 0.055, 0.14]} />
          <Solid resources={resources} finish="gold" shape="gem" position={[0, -0.005, 0.16]} scale={[0.04, 0.036, 0.065]} />
        </group>
      </group>
    </group>
  </group>
}

function BeeWing({ resources, side, rear, wingRefs, index, detail }: { resources: Resources; side: number; rear: boolean; wingRefs: MutableRefObject<Array<Group | null>>; index: number; detail: number }) {
  const size = rear ? 0.74 : 1.02
  return <group ref={(node) => { wingRefs.current[index] = node }} name={`hq-wing-${side < 0 ? 'left' : 'right'}-${rear ? 'rear' : 'front'}`} position={[side * 0.31, 1.43, rear ? -0.40 : 0.02]}>
    <Solid resources={resources} finish="gold" shape="sphere" scale={[0.12, 0.10, 0.13]} />
    <group scale={[size * 0.85, size, 0.85]}>
      <Solid resources={resources} finish="glass" shape="wing" name={`hq-volumetric-wing-${index}`} />
      <Segment resources={resources} from={[0, 0, 0.08]} to={[0.015, 1.19, 0.09]} radius={0.014} finish="glow" />
      <Segment resources={resources} from={[0.01, 0.32, 0.08]} to={[-0.36, 0.60, 0.06]} radius={0.010} finish="lightGold" />
      <Segment resources={resources} from={[0.01, 0.46, 0.08]} to={[0.29, 0.88, 0.06]} radius={0.010} finish="lightGold" />
      {detail > 0 && <>
        <Segment resources={resources} from={[-0.36, 0.60, 0.03]} to={[-0.24, 1.04, 0.03]} radius={0.012} finish="gold" />
        <Segment resources={resources} from={[-0.24, 1.04, 0.03]} to={[0.03, 1.22, 0.03]} radius={0.012} finish="glow" />
        <Segment resources={resources} from={[0.03, 1.22, 0.03]} to={[0.29, 0.92, 0.03]} radius={0.012} finish="gold" />
        <Segment resources={resources} from={[0.29, 0.92, 0.03]} to={[0.35, 0.36, 0.03]} radius={0.012} finish="gold" />
      </>}
    </group>
  </group>
}

function QueenBee({ pose, detail }: { pose: MutableRefObject<FamiliarPose>; detail: number }) {
  const resources = useMemo(() => createResources(detail), [detail])
  const body = useRef<Group>(null), chest = useRef<Group>(null), head = useRef<Group>(null), abdomen = useRef<Group>(null)
  const antennae = useRef<Array<Group | null>>([]), wings = useRef<Array<Group | null>>([]), lids = useRef<Array<Group | null>>([])
  const legs = useMemo<BeeLeg[]>(() => [-1, 1].flatMap((side) => [0, 1, 2].map((index) => ({ upper: null, lower: null, foot: null, side, index }))), [])
  useEffect(() => () => { Object.values(resources.geometries).forEach((g) => g.dispose()); Object.values(resources.materials).forEach((m) => m.dispose()) }, [resources])
  useFrame(() => {
    const p = pose.current, energy = Math.max(0, Math.min(1, p.energy)), drop = -p.crouch * 0.12
    resources.materials.glow.emissiveIntensity = 0.08 + energy * 2.8
    resources.materials.gold.emissiveIntensity = 0.02 + energy * 0.20
    resources.materials.glass.emissiveIntensity = 0.04 + energy * 0.45
    resources.materials.glass.opacity = 0.16 + energy * 0.32
    if (body.current) { body.current.position.y = drop; body.current.rotation.z = Math.sin(p.time * 3.6) * p.stride * 0.012 }
    if (chest.current) chest.current.scale.set(1 + p.breathe, 1 + p.breathe * 0.75, 1 + p.breathe)
    if (abdomen.current) { abdomen.current.rotation.x = p.breathe * 0.8; abdomen.current.rotation.y = p.tail * 0.1 }
    if (head.current) { head.current.rotation.y = p.headYaw; head.current.rotation.x = p.headPitch; head.current.rotation.z = p.mood * 0.025 }
    antennae.current.forEach((part, i) => { if (part) { part.rotation.z = (i === 0 ? 1 : -1) * (0.10 + (i === 0 ? p.earLeft : p.earRight) * 0.45); part.rotation.x = -p.focus * 0.14 } })
    wings.current.forEach((part, i) => { if (part) { const side = i < 2 ? -1 : 1, rear = i % 2 === 1; part.rotation.z = -side * ((rear ? 0.91 : 0.94) + Math.sin(p.time * (8 + energy * 9) + (rear ? 0.75 : 0)) * energy * (p.time === 0 ? 0 : 0.18)); part.rotation.x = -0.35 + (rear ? -0.15 : 0) + Math.sin(p.time * 4.2) * energy * 0.04 } })
    updateEyes(lids.current, p.blink)
    for (const leg of legs) {
      if (!leg.upper || !leg.lower || !leg.foot) continue
      const phase = p.time * 4.7 + leg.index * 2.1 + (leg.side > 0 ? Math.PI : 0)
      const lift = p.time === 0 ? 0 : Math.max(0, Math.sin(phase)) * p.stride * 0.055
      const height = 1.05 + drop - 0.08 - lift, reach = 0.27 + Math.cos(phase) * p.stride * 0.025
      const distance = Math.min(1.055, Math.hypot(height, reach)), clamp = (v: number) => Math.max(-1, Math.min(1, v))
      const alpha = Math.acos(clamp((0.48 ** 2 + distance ** 2 - 0.58 ** 2) / (2 * 0.48 * distance)))
      const knee = Math.PI - Math.acos(clamp((0.48 ** 2 + 0.58 ** 2 - distance ** 2) / (2 * 0.48 * 0.58)))
      leg.upper.rotation.z = leg.side * (Math.atan2(reach, height) + alpha); leg.lower.rotation.z = -leg.side * knee
      leg.foot.rotation.z = -(leg.upper.rotation.z + leg.lower.rotation.z)
    }
  })
  return <group ref={body} name="familiar-hq" dispose={null}>
    <group ref={abdomen} name="hq-tail-abdomen" position={[0, 1.10, -0.31]}>
      <Solid resources={resources} finish="gold" shape="sphere" scale={[0.49, 0.43, 0.74]} />
      {[-0.46, -0.15, 0.18].map((z) => { const f = Math.sqrt(1 - (z / 0.78) ** 2); return <Solid key={z} name={`hq-abdomen-band-${z}`} resources={resources} finish="dark" shape="ring" position={[0, 0, z]} scale={[0.445 * f, 0.39 * f, 0.45]} /> })}
      <Solid resources={resources} finish="lightGold" shape="gem" position={[0, 0.04, -0.69]} scale={[0.21, 0.20, 0.22]} />
      <Solid resources={resources} finish="dark" shape="cone" position={[0, -0.03, -0.86]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.075, 0.23, 0.075]} />
    </group>
    <group ref={chest} name="hq-chest" position={[0, 1.32, 0.22]}>
      <Solid resources={resources} finish="dark" scale={[0.42, 0.39, 0.43]} />
      <Solid resources={resources} finish="gold" position={[0, 0.03, 0.05]} scale={[0.39, 0.35, 0.40]} />
      <Solid resources={resources} finish="cream" position={[0, -0.18, 0.27]} scale={[0.26, 0.18, 0.16]} />
      <Solid resources={resources} finish="dark" shape="hex" position={[0, -0.07, 0.385]} scale={[0.14, 0.14, 0.20]} />
      <Solid name="hq-chest-heart" resources={resources} finish="glow" shape="gem" position={[0, -0.07, 0.42]} scale={[0.084, 0.105, 0.06]} />
    </group>
    {[-1, 1].map((side, s) => <group key={side} name={`hq-wing-${side < 0 ? 'left' : 'right'}`}>
      {[false, true].map((rear, i) => <BeeWing key={i} resources={resources} side={side} rear={rear} wingRefs={wings} index={s * 2 + i} detail={detail} />)}
    </group>)}
    {legs.map((rig, i) => <BeeLegMesh key={i} resources={resources} rig={rig} />)}
    <group ref={head} name="hq-head" position={[0, 1.79, 0.47]}>
      <Solid resources={resources} finish="gold" shape="sphere" scale={[0.43, 0.39, 0.40]} />
      <Solid resources={resources} finish="dark" shape="sphere" position={[0, 0.04, 0.22]} scale={[0.37, 0.29, 0.24]} />
      {[-1, 1].map((side, i) => <Eye key={side} resources={resources} side={side} lids={lids} index={i} bee />)}
      <Solid resources={resources} finish="cream" position={[0, -0.22, 0.26]} scale={[0.24, 0.13, 0.18]} />
      <Segment resources={resources} from={[-0.10, -0.21, 0.4]} to={[0.10, -0.21, 0.4]} radius={0.013} finish="dark" />
      {[-1, 1].map((side, i) => <group key={`antenna-${side}`} name={`hq-antenna-${side < 0 ? 'left' : 'right'}`} ref={(node) => { antennae.current[i] = node }} position={[side * 0.22, 0.22, 0.05]}>
        <Segment resources={resources} from={[0, 0, 0]} to={[side * 0.06, 0.22, 0.02]} radius={0.026} finish="dark" />
        <Segment resources={resources} from={[side * 0.06, 0.22, 0.02]} to={[side * 0.14, 0.37, 0.13]} radius={0.023} finish="gold" />
        <Solid resources={resources} finish="glow" shape="sphere" position={[side * 0.14, 0.37, 0.13]} scale={[0.053, 0.053, 0.053]} />
      </group>)}
      <group name="hq-crown-cells" position={[0, 0.40, -0.02]}>
        <Solid resources={resources} finish="gold" shape="ring" rotation={[Math.PI / 2, 0, 0]} scale={[0.27, 0.27, 0.30]} />
        {Array.from({ length: 5 }, (_, i) => { const angle = i * Math.PI * 2 / 5; return <group key={i} name={`hq-crown-cell-${i}`} position={[Math.cos(angle) * 0.23, 0.12, Math.sin(angle) * 0.23]}>
          <Solid resources={resources} finish="lightGold" shape="gem" scale={[0.06, 0.17, 0.06]} />
          <Solid resources={resources} finish="glow" shape="gem" position={[0, 0.18, 0]} scale={[0.037, 0.057, 0.037]} />
        </group> })}
        <Solid resources={resources} finish="gold" shape="hex" position={[0, 0.10, 0.29]} scale={[0.082, 0.082, 0.13]} />
      </group>
    </group>
  </group>
}

function Feather({ resources, position, rotation, length, width = 0.27, hot = false, detail }: {
  resources: Resources; position: V3; rotation?: V3; length: number; width?: number; hot?: boolean; detail: number
}) {
  return <group position={position} rotation={rotation}>
    <Solid resources={resources} finish="red" shape="feather" scale={[width * 1.07, length, 0.40]} />
    <Solid resources={resources} finish={hot ? 'hot' : 'ember'} shape="feather" position={[0, 0.018, 0.035]} scale={[width * 0.81, length * 0.96, 0.26]} />
    {detail > 0 && <Segment resources={resources} from={[0, 0.03, 0.10]} to={[0.012, length * 0.92, 0.09]} radius={0.009} finish="lightGold" />}
  </group>
}
interface BirdWing { shoulder: Group | null; wrist: Group | null; side: number }
function PhoenixWing({ resources, rig, detail }: { resources: Resources; rig: BirdWing; detail: number }) {
  const side = rig.side, count = detail > 1 ? 8 : detail > 0 ? 7 : 5
  return <group ref={(node) => { rig.shoulder = node }} name={`claude-wing-${side < 0 ? 'left' : 'right'}`} position={[side * 0.28, 1.49, -0.11]}>
    <Segment resources={resources} from={[0, 0, 0]} to={[side * 0.48, 0.18, -0.015]} radius={0.073} finish="dark" />
    <Solid resources={resources} finish="gold" position={[side * 0.20, 0.05, 0.02]} rotation={[0, 0, -side * 0.95]} scale={[0.19, 0.30, 0.12]} />
    {[0, 1, 2].map((n) => <Feather key={n} resources={resources} position={[side * (0.12 + n * 0.12), -0.06 + n * 0.035, 0.08]} rotation={[0.12, 0, -side * (1.65 - n * 0.10)]} width={0.25} length={0.47} detail={detail} hot={n === 0} />)}
    <group ref={(node) => { rig.wrist = node }} name={`claude-wing-${side < 0 ? 'left' : 'right'}-wrist`} position={[side * 0.49, 0.18, -0.025]}>
      <Solid resources={resources} finish="gold" shape="sphere" scale={[0.09, 0.09, 0.09]} />
      <Segment resources={resources} from={[0, 0, 0]} to={[side * 0.36, 0.21, -0.06]} radius={0.055} finish="dark" />
      {Array.from({ length: count }, (_, n) => {
        const ratio = n / (count - 1), angle = -side * (1.12 - ratio * 0.83)
        return <Feather key={n} resources={resources} position={[side * (0.06 + ratio * 0.30), 0.08 + ratio * 0.12, 0.02 - ratio * 0.035]} rotation={[-0.07, side * 0.07, angle]} width={0.25 - ratio * 0.04} length={0.69 - ratio * 0.18} detail={detail} hot={n % 3 === 0} />
      })}
      {detail > 0 && [0, 1, 2, 3].map((n) => <Feather key={`covert-${n}`} resources={resources} position={[side * (n * 0.09), -0.03 + n * 0.025, 0.14]} rotation={[0.12, 0, -side * (1.45 - n * 0.12)]} width={0.20} length={0.35} hot detail={0} />)}
    </group>
  </group>
}

interface BirdLeg { upper: Group | null; lower: Group | null; foot: Group | null; side: number }
function BirdLegMesh({ resources, rig }: { resources: Resources; rig: BirdLeg }) {
  return <group name={`claude-leg-${rig.side < 0 ? 'left' : 'right'}`} position={[rig.side * 0.18, 0.73, 0.02]}>
    <group ref={(node) => { rig.upper = node }} name={`claude-leg-${rig.side}-thigh`}>
      <Solid resources={resources} finish="dark" position={[0, -0.10, 0]} scale={[0.12, 0.20, 0.14]} />
      <Solid resources={resources} finish="red" position={[0, -0.10, 0.03]} scale={[0.13, 0.16, 0.12]} />
      <Solid resources={resources} finish="gold" shape="rod" position={[0, -0.155, 0]} scale={[0.048, 0.31, 0.048]} />
      <group ref={(node) => { rig.lower = node }} name={`claude-leg-${rig.side}-hock`} position={[0, -0.31, 0]}>
        <Solid resources={resources} finish="lightGold" shape="sphere" scale={[0.063, 0.063, 0.063]} />
        <Solid resources={resources} finish="gold" shape="rod" position={[0, -0.20, 0]} scale={[0.032, 0.40, 0.032]} />
        <group ref={(node) => { rig.foot = node }} name={`claude-leg-${rig.side}-claws`} position={[0, -0.4, 0]}>
          <Solid resources={resources} finish="gold" position={[0, -0.016, 0.055]} scale={[0.10, 0.056, 0.14]} />
          {[-1, 0, 1].map((toe) => <group key={toe} position={[toe * 0.073, 0, 0.10]} rotation={[0, toe * 0.22, 0]}>
            <Segment resources={resources} from={[0, 0, 0]} to={[0, -0.015, 0.18]} radius={0.021} finish="lightGold" />
            <Solid resources={resources} finish="dark" shape="cone" position={[0, -0.026, 0.22]} rotation={[Math.PI / 2, 0, 0]} scale={[0.026, 0.11, 0.026]} />
          </group>)}
          <Segment resources={resources} from={[0, 0, 0]} to={[0, 0.01, -0.15]} radius={0.023} finish="gold" />
        </group>
      </group>
    </group>
  </group>
}

function EmberPhoenix({ pose, detail }: { pose: MutableRefObject<FamiliarPose>; detail: number }) {
  const resources = useMemo(() => createResources(detail), [detail])
  const body = useRef<Group>(null), chest = useRef<Group>(null), head = useRef<Group>(null), jaw = useRef<Group>(null)
  const tailRoot = useRef<Group>(null), tailMid = useRef<Group>(null), tailTip = useRef<Group>(null), crest = useRef<Group>(null)
  const lids = useRef<Array<Group | null>>([])
  const wings = useMemo<BirdWing[]>(() => [-1, 1].map((side) => ({ shoulder: null, wrist: null, side })), [])
  const legs = useMemo<BirdLeg[]>(() => [-1, 1].map((side) => ({ upper: null, lower: null, foot: null, side })), [])
  useEffect(() => () => { Object.values(resources.geometries).forEach((g) => g.dispose()); Object.values(resources.materials).forEach((m) => m.dispose()) }, [resources])
  useFrame(() => {
    const p = pose.current, energy = Math.max(0, Math.min(1, p.energy)), drop = -p.crouch * 0.18
    resources.materials.glow.emissiveIntensity = 0.08 + energy * 2.7
    resources.materials.ember.emissiveIntensity = 0.04 + energy * 0.78
    resources.materials.hot.emissiveIntensity = 0.08 + energy * 1.55
    resources.materials.red.emissiveIntensity = 0.02 + energy * 0.23
    if (body.current) { body.current.position.y = drop; body.current.rotation.z = p.mood * 0.012 }
    if (chest.current) chest.current.scale.set(1 + p.breathe * 0.6, 1 + p.breathe, 1 + p.breathe * 0.75)
    if (head.current) { head.current.rotation.y = p.headYaw; head.current.rotation.x = p.headPitch * 0.85; head.current.rotation.z = -p.mood * 0.025 }
    if (jaw.current) jaw.current.rotation.x = Math.max(0, energy - 0.55) * 0.17
    if (crest.current) { crest.current.rotation.x = -0.14 + p.earLeft * 0.18; crest.current.rotation.z = p.earRight * 0.08 }
    for (const wing of wings) {
      if (wing.shoulder) { wing.shoulder.rotation.z = wing.side * (0.22 + p.mood * 0.10 + Math.sin(p.time * 2.4) * energy * 0.075); wing.shoulder.rotation.y = -wing.side * (0.10 + p.crouch * 0.15 + Math.sin(p.time * 2.4) * energy * 0.06) }
      if (wing.wrist) { wing.wrist.rotation.z = wing.side * (0.13 + Math.sin(p.time * 2.4 - 0.3) * energy * (p.time === 0 ? 0 : 0.06)); wing.wrist.rotation.x = -p.focus * 0.10 }
    }
    if (tailRoot.current) { tailRoot.current.rotation.y = p.tail * 0.42; tailRoot.current.rotation.x = -1.95 - p.crouch * 0.12 + p.mood * 0.035 }
    if (tailMid.current) { tailMid.current.rotation.y = p.tail * 0.24; tailMid.current.rotation.x = p.breathe * 0.7 }
    if (tailTip.current) { tailTip.current.rotation.y = p.tail * 0.16; tailTip.current.rotation.z = Math.sin(p.time * 2.4) * energy * 0.035 }
    updateEyes(lids.current, p.blink)
    for (const leg of legs) {
      if (!leg.upper || !leg.lower || !leg.foot) continue
      const phase = p.time * 4.1 + (leg.side > 0 ? Math.PI : 0), lift = p.time === 0 ? 0 : Math.max(0, Math.sin(phase)) * p.stride * 0.04
      const height = 0.73 + drop - 0.08 - lift, forward = 0.025 + Math.cos(phase) * p.stride * 0.035
      const distance = Math.min(0.704, Math.hypot(height, forward)), clamp = (v: number) => Math.max(-1, Math.min(1, v))
      const alpha = Math.acos(clamp((0.31 ** 2 + distance ** 2 - 0.4 ** 2) / (2 * 0.31 * distance)))
      const knee = Math.PI - Math.acos(clamp((0.31 ** 2 + 0.4 ** 2 - distance ** 2) / (2 * 0.31 * 0.4)))
      leg.upper.rotation.x = Math.atan2(-forward, height) - alpha; leg.lower.rotation.x = knee
      leg.foot.rotation.x = -(leg.upper.rotation.x + leg.lower.rotation.x)
    }
  })
  return <group ref={body} name="familiar-claude" dispose={null}>
    <group ref={chest} name="claude-chest" position={[0, 1.17, -0.04]}>
      <Solid resources={resources} finish="dark" scale={[0.33, 0.61, 0.37]} />
      <Solid resources={resources} finish="red" position={[0, 0.11, -0.06]} scale={[0.34, 0.45, 0.31]} />
      {[-1, 1].map((side) => <group key={side}>
        <Feather resources={resources} position={[side * 0.11, -0.19, 0.27]} rotation={[-0.06, side * 0.18, side * 0.24]} length={0.43} width={0.25} hot detail={detail} />
        <Feather resources={resources} position={[side * 0.20, -0.13, 0.20]} rotation={[0, side * 0.38, side * 0.42]} length={0.39} width={0.22} detail={detail} />
        <Feather resources={resources} position={[side * 0.23, -0.28, -0.02]} rotation={[0.05, side * 0.6, side * 0.54]} length={0.31} width={0.22} detail={0} />
      </group>)}
      <Solid name="claude-chest-ember" resources={resources} finish="glow" shape="gem" position={[0, 0.16, 0.38]} scale={[0.085, 0.15, 0.055]} />
    </group>
    {legs.map((rig, i) => <BirdLegMesh key={i} resources={resources} rig={rig} />)}
    {wings.map((rig, i) => <PhoenixWing key={i} resources={resources} rig={rig} detail={detail} />)}
    <group name="claude-neck" position={[0, 1.53, 0.12]}>
      <Solid resources={resources} finish="dark" scale={[0.19, 0.36, 0.22]} />
      {[-1, 1].map((side) => [0, 1, 2].map((n) => <Feather key={`${side}-${n}`} resources={resources} position={[side * (0.09 + n * 0.025), 0.13 - n * 0.13, 0.13 - n * 0.03]} rotation={[0.15, side * 0.4, side * (0.35 + n * 0.2)]} length={0.27} width={0.17} hot detail={0} />))}
    </group>
    <group ref={head} name="claude-head" position={[0, 1.97, 0.29]}>
      <Solid resources={resources} finish="dark" scale={[0.24, 0.26, 0.25]} />
      <Solid resources={resources} finish="ember" position={[0, -0.03, 0.045]} scale={[0.23, 0.19, 0.24]} />
      {[-1, 1].map((side, i) => <Eye key={side} resources={resources} side={side} lids={lids} index={i} />)}
      <Solid resources={resources} finish="lightGold" shape="cone" position={[0, -0.015, 0.30]} rotation={[Math.PI / 2, 0, Math.PI / 5]} scale={[0.135, 0.30, 0.12]} />
      <Solid resources={resources} finish="gold" shape="cone" position={[0, -0.075, 0.445]} rotation={[Math.PI, 0, 0]} scale={[0.057, 0.13, 0.072]} />
      <group ref={jaw} name="claude-jaw" position={[0, -0.11, 0.15]}><Solid resources={resources} finish="gold" shape="cone" position={[0, -0.008, 0.12]} rotation={[Math.PI / 2, 0, 0]} scale={[0.095, 0.23, 0.055]} /></group>
      {[-1, 1].map((side) => <Feather key={`brow-${side}`} resources={resources} position={[side * 0.11, 0.11, 0.20]} rotation={[-0.45, side * 0.14, -side * 0.65]} length={0.23} width={0.13} hot detail={0} />)}
      <group ref={crest} name="claude-crest" position={[0, 0.10, -0.12]}>
        {[-1, 0, 1].map((n) => <Feather key={n} resources={resources} position={[n * 0.075, 0, -Math.abs(n) * 0.015]} rotation={[-0.35, 0, -n * 0.30]} length={n === 0 ? 0.43 : 0.34} width={0.13} hot={n === 0} detail={detail} />)}
      </group>
    </group>
    <group ref={tailRoot} name="claude-tail" position={[0, 1.01, -0.36]} rotation={[-1.95, 0, 0]}>
      <Segment resources={resources} from={[0, 0, 0]} to={[0, 0.4, 0]} radius={0.07} finish="dark" />
      <Feather resources={resources} position={[0, 0.02, 0.03]} length={0.48} width={0.30} detail={detail} />
      <group ref={tailMid} name="claude-tail-mid" position={[0, 0.40, 0]}>
        <Segment resources={resources} from={[0, 0, 0]} to={[0, 0.32, 0]} radius={0.043} finish="gold" />
        {[-2, -1, 1, 2].map((n) => <Feather key={n} resources={resources} position={[n * 0.07, 0.03, -Math.abs(n) * 0.025]} rotation={[0, 0, -n * 0.22]} length={0.62 - Math.abs(n) * 0.04} width={0.24} detail={detail} />)}
        <group ref={tailTip} name="claude-tail-tip" position={[0, 0.32, 0]}>
          {[-1, 0, 1].map((n) => <Feather key={n} resources={resources} position={[n * 0.06, 0, n === 0 ? 0.06 : 0]} rotation={[0, 0, -n * 0.14]} length={n === 0 ? 0.81 : 0.67} width={n === 0 ? 0.26 : 0.24} hot={n === 0} detail={detail} />)}
        </group>
      </group>
    </group>
  </group>
}

/** Articulated original aerial silhouettes. The caller owns time and execution state. */
export function AerialFamiliar({ id, pose, detail }: { id: 'hq' | 'claude'; pose: MutableRefObject<FamiliarPose>; detail: number }) {
  const quality = Math.max(0, Math.min(2, Math.floor(detail)))
  return id === 'hq' ? <QueenBee pose={pose} detail={quality} /> : <EmberPhoenix pose={pose} detail={quality} />
}
