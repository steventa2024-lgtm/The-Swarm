import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, SphereGeometry,
  CylinderGeometry, BoxGeometry, OctahedronGeometry, MeshStandardMaterial,
  type Material,
} from 'three'
import type { WolfPose } from '@/lib/familiarAnimation'

export type { WolfPose } from '@/lib/familiarAnimation'
type V3 = [number, number, number]
type Finish = 'frame' | 'joint' | 'ice' | 'cobalt' | 'crystal' | 'glow' | 'face' | 'nose'

/** Closed, faceted solid: raised front facets, solid side walls and a closed rear. */
function shieldGeometry(outline: Array<[number, number]>, depth = 0.12, ridge = 0.13) {
  const points: number[] = []
  const triangle = (a: V3, b: V3, c: V3) => points.push(...a, ...b, ...c)
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length]
    const af: V3 = [a[0], a[1], depth], bf: V3 = [b[0], b[1], depth]
    const ab: V3 = [a[0], a[1], -depth], bb: V3 = [b[0], b[1], -depth]
    triangle([0, 0.05, depth + ridge], af, bf)
    triangle([0, 0.05, -depth], bb, ab)
    triangle(af, ab, bb); triangle(af, bb, bf)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
  geometry.computeVertexNormals()
  return geometry
}

function crystalGeometry() {
  const vertices: number[] = []
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, b = (i + 1) * Math.PI / 3
    const p: V3 = [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.45]
    const q: V3 = [Math.cos(b) * 0.5, 0, Math.sin(b) * 0.45]
    vertices.push(...p, 0.04, 1, -0.04, ...q)
    vertices.push(...q, 0, -0.13, 0, ...p)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  return geometry
}

function createResources(detail: number) {
  const geometries = {
    facet: new IcosahedronGeometry(1, detail >= 2 ? 2 : 1),
    sphere: new SphereGeometry(1, detail >= 2 ? 20 : 12, detail >= 2 ? 14 : 8),
    bone: new CylinderGeometry(0.5, 0.44, 1, 6, 1),
    box: new BoxGeometry(1, 1, 1),
    gem: new OctahedronGeometry(1),
    crystal: crystalGeometry(),
    shield: shieldGeometry([[0, 0.65], [-0.5, 0.23], [-0.32, -0.42], [0, -0.65], [0.32, -0.42], [0.5, 0.23]]),
    ear: shieldGeometry([[0, 1], [-0.5, 0], [0.5, 0]], 0.06, 0.07),
    upperLid: new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    lowerLid: new SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  }
  const materials: Record<Finish, MeshStandardMaterial> = {
    frame: new MeshStandardMaterial({ color: '#07142b', metalness: 0.45, roughness: 0.38, flatShading: true }),
    joint: new MeshStandardMaterial({ color: '#1b3153', metalness: 0.65, roughness: 0.32 }),
    ice: new MeshStandardMaterial({ color: '#d3e7ff', metalness: 0.34, roughness: 0.3, flatShading: true }),
    cobalt: new MeshStandardMaterial({ color: '#2456bc', metalness: 0.48, roughness: 0.28, flatShading: true }),
    crystal: new MeshStandardMaterial({ color: '#3b91ff', emissive: '#0751d7', emissiveIntensity: 0.65, metalness: 0.3, roughness: 0.15, flatShading: true }),
    glow: new MeshStandardMaterial({ color: '#9cfaff', emissive: '#34dfff', emissiveIntensity: 2.7, metalness: 0.05, roughness: 0.2, toneMapped: false }),
    face: new MeshStandardMaterial({ color: '#030d21', metalness: 0.3, roughness: 0.16 }),
    nose: new MeshStandardMaterial({ color: '#020713', metalness: 0.18, roughness: 0.27 }),
  }
  return { geometries, materials }
}
type Resources = ReturnType<typeof createResources>

function Solid({ resources, finish = 'ice', shape = 'facet', position, rotation, scale, name }: {
  resources: Resources; finish?: Finish; shape?: keyof Resources['geometries']; position?: V3; rotation?: V3; scale?: V3; name?: string
}) {
  return <mesh name={name} geometry={resources.geometries[shape]} material={resources.materials[finish]} position={position} rotation={rotation} scale={scale} castShadow receiveShadow />
}

function Plate({ resources, position, rotation, scale, finish = 'ice', trim = true }: {
  resources: Resources; position: V3; rotation?: V3; scale: V3; finish?: Finish; trim?: boolean
}) {
  return <group position={position} rotation={rotation} scale={scale}>
    {trim && <mesh geometry={resources.geometries.shield} material={resources.materials.frame} scale={[1.065, 1.045, 0.9]} castShadow />}
    <mesh geometry={resources.geometries.shield} material={resources.materials[finish]} position={[0, 0, 0.022]} castShadow receiveShadow />
  </group>
}

interface LegRig { upper: Group | null; lower: Group | null; paw: Group | null; side: number; front: boolean; hipY: number }

function WolfLeg({ resources, rig, side, front, trim }: { resources: Resources; rig: LegRig; side: number; front: boolean; trim: boolean }) {
  const upper = 0.55, lower = 0.6
  const name = `wolf-leg-${front ? 'front' : 'rear'}-${side < 0 ? 'left' : 'right'}`
  return <group name={name} position={[side * (front ? 0.38 : 0.36), rig.hipY, front ? 0.52 : -0.62]}>
    <group name={`${name}-hip`} ref={(group) => { rig.upper = group }}>
      <Solid resources={resources} finish="frame" scale={[front ? 0.2 : 0.26, front ? 0.27 : 0.32, 0.25]} />
      <Solid resources={resources} finish="joint" shape="sphere" position={[side * 0.12, 0, 0]} scale={[0.11, 0.16, 0.16]} />
      <Plate resources={resources} position={[side * 0.17, -0.05, 0]} rotation={[0, side * Math.PI / 2, front ? side * 0.05 : -side * 0.1]} scale={[front ? 0.44 : 0.51, front ? 0.48 : 0.57, 0.32]} trim={trim} />
      <Solid resources={resources} finish="frame" shape="bone" position={[0, -upper / 2, 0]} scale={[0.2, upper, 0.2]} />
      <Solid resources={resources} finish={front ? 'ice' : 'cobalt'} position={[0, -0.28, 0.035]} scale={[front ? 0.15 : 0.2, 0.28, 0.17]} />
      <Solid resources={resources} finish="glow" shape="gem" position={[side * 0.205, 0.06, 0.07]} rotation={[0, side * Math.PI / 2, 0]} scale={[0.065, 0.095, 0.035]} />
      <group name={`${name}-knee`} ref={(group) => { rig.lower = group }} position={[0, -upper, 0]}>
        <Solid resources={resources} finish="joint" shape="sphere" scale={[0.12, 0.12, 0.13]} />
        <Solid resources={resources} finish="frame" shape="bone" position={[0, -lower / 2, 0]} scale={[0.14, lower, 0.14]} />
        <Solid resources={resources} finish="ice" position={[0, -0.22, 0.035]} scale={[0.12, 0.26, 0.13]} />
        <Plate resources={resources} position={[0, -0.25, 0.12]} scale={[0.2, 0.35, 0.19]} finish="cobalt" trim={false} />
        <Solid resources={resources} finish="glow" shape="box" position={[0, -0.2, 0.145]} scale={[0.025, 0.22, 0.016]} />
        <group name={`${name}-paw`} ref={(group) => { rig.paw = group }} position={[0, -lower, 0]}>
          <Solid resources={resources} finish="joint" shape="sphere" scale={[0.11, 0.11, 0.1]} />
          <Solid resources={resources} finish="frame" position={[0, -0.03, 0.07]} scale={[0.17, 0.125, 0.23]} />
          <Solid resources={resources} finish="ice" position={[0, 0.025, 0.12]} scale={[0.175, 0.09, 0.2]} />
          {[-1, 0, 1].map((toe) => <group key={toe} position={[toe * 0.105, -0.03, 0.22]}>
            <Solid resources={resources} finish="cobalt" scale={[0.063, 0.075, 0.115]} />
            <Solid resources={resources} finish="ice" shape="crystal" position={[0, -0.012, 0.085]} rotation={[Math.PI / 2, 0, 0]} scale={[0.065, 0.08, 0.055]} />
          </group>)}
        </group>
      </group>
    </group>
  </group>
}

function solveLeg(rig: LegRig, rootDrop: number, time: number, stride: number) {
  if (!rig.upper || !rig.lower || !rig.paw) return
  const phase = time * 4.8 + (rig.side > 0 ? Math.PI : 0) + (rig.front ? 0 : Math.PI)
  const lift = Math.max(0, Math.sin(phase)) * stride * 0.16
  const targetZ = -Math.cos(phase) * stride * 0.19 + (rig.front ? 0.035 : -0.045)
  const height = rig.hipY + rootDrop - 0.15 - lift
  const a = 0.55, b = 0.6
  const distance = Math.max(0.1, Math.min(a + b - 0.008, Math.hypot(height, targetZ)))
  const clamp = (value: number) => Math.max(-1, Math.min(1, value))
  const alpha = Math.acos(clamp((a * a + distance * distance - b * b) / (2 * a * distance)))
  const knee = Math.PI - Math.acos(clamp((a * a + b * b - distance * distance) / (2 * a * b)))
  const bend = rig.front ? 1 : -1
  rig.upper.rotation.x = Math.atan2(-targetZ, height) + bend * alpha
  rig.lower.rotation.x = -bend * knee
  rig.paw.rotation.x = -(rig.upper.rotation.x + rig.lower.rotation.x)
}

/** A single articulated quadruped rig. All visible parts are closed 3D solids; no image planes. */
export function CodexWolf({ pose, detail }: { pose: MutableRefObject<WolfPose>; detail: number }) {
  const quality = Math.max(0, Math.min(2, Math.floor(detail)))
  const resources = useMemo(() => createResources(quality), [quality])
  const body = useRef<Group>(null), chest = useRef<Group>(null), neck = useRef<Group>(null), head = useRef<Group>(null)
  const jaw = useRef<Group>(null), leftEar = useRef<Group>(null), rightEar = useRef<Group>(null)
  const tailRoot = useRef<Group>(null), tailMid = useRef<Group>(null), tailTip = useRef<Group>(null)
  const lids = useRef<Array<Group | null>>([]), brows = useRef<Array<Group | null>>([])
  const legs = useMemo<LegRig[]>(() => [
    { upper: null, lower: null, paw: null, side: -1, front: true, hipY: 1.25 },
    { upper: null, lower: null, paw: null, side: 1, front: true, hipY: 1.25 },
    { upper: null, lower: null, paw: null, side: -1, front: false, hipY: 1.22 },
    { upper: null, lower: null, paw: null, side: 1, front: false, hipY: 1.22 },
  ], [])

  useEffect(() => () => {
    Object.values(resources.geometries).forEach((geometry) => geometry.dispose())
    Object.values(resources.materials).forEach((material: Material) => material.dispose())
  }, [resources])

  useFrame(() => {
    const p = pose.current
    const energy = Math.max(0, Math.min(1, p.energy))
    resources.materials.glow.emissiveIntensity = 0.2 + energy * 2.6
    resources.materials.crystal.emissiveIntensity = 0.1 + energy * 0.65
    const drop = -p.crouch * 0.29
    if (body.current) { body.current.position.y = drop; body.current.rotation.z = p.stride * Math.sin(p.time * 4.8) * 0.013 }
    if (chest.current) chest.current.scale.set(1 + p.breathe * 0.45, 1 + p.breathe, 1 + p.breathe * 0.3)
    if (neck.current) { neck.current.rotation.x = p.headPitch * 0.2; neck.current.rotation.y = p.headYaw * 0.13 }
    if (head.current) { head.current.rotation.y = p.headYaw * 0.87; head.current.rotation.x = p.headPitch * 0.8; head.current.rotation.z = -p.mood * 0.025 }
    if (jaw.current) jaw.current.rotation.x = Math.max(0, p.energy - 0.58) * 0.24 + Math.max(0, -p.mood) * 0.035
    if (leftEar.current) { leftEar.current.rotation.z = 0.17 + p.earLeft; leftEar.current.rotation.x = -0.12 + p.earLeft * 0.35 }
    if (rightEar.current) { rightEar.current.rotation.z = -0.17 - p.earRight; rightEar.current.rotation.x = -0.12 + p.earRight * 0.35 }
    const blink = Math.max(0, Math.min(1, p.blink))
    for (let i = 0; i < lids.current.length; i++) {
      const lid = lids.current[i]
      if (lid) {
        // Lids retract into a thin socket rim while open, rather than translating
        // full hemispheres above/below the eyes like separate spherical goggles.
        lid.visible = blink > 0.002
        lid.position.y = (i % 2 === 0 ? 1 : -1) * 0.165 * (1 - blink)
        lid.scale.y = Math.max(0.002, blink)
      }
    }
    for (let i = 0; i < brows.current.length; i++) {
      const brow = brows.current[i]
      if (brow) { brow.rotation.z = (i === 0 ? -1 : 1) * (0.08 + p.focus * 0.12 - p.mood * 0.06); brow.position.y = 0.15 + Math.max(0, -p.mood) * 0.025 }
    }
    if (tailRoot.current) { tailRoot.current.rotation.y = p.tail; tailRoot.current.rotation.x = -0.45 + p.mood * 0.15 + p.energy * 0.08 }
    if (tailMid.current) { tailMid.current.rotation.y = p.tail * 0.62; tailMid.current.rotation.x = 0.1 + p.mood * 0.12 }
    if (tailTip.current) { tailTip.current.rotation.y = p.tail * 0.45; tailTip.current.rotation.x = 0.18 + p.mood * 0.1 }
    legs.forEach((leg) => solveLeg(leg, drop, p.time, p.stride))
  })

  const trim = quality > 0
  return <group ref={body} name="codex-articulated-wolf" dispose={null}>
    <group name="wolf-chest" ref={chest} position={[0, 1.35, 0]}>
      <Solid name="wolf-torso-core" resources={resources} finish="frame" scale={[0.43, 0.44, 0.86]} />
      <Solid resources={resources} finish="cobalt" position={[0, 0.13, -0.25]} scale={[0.41, 0.33, 0.61]} />
      <Solid resources={resources} finish="ice" position={[0, 0.02, 0.43]} scale={[0.42, 0.43, 0.43]} />
      {[-0.5, -0.1, 0.3].map((z, index) => <Plate key={`back-${z}`} resources={resources} position={[0, 0.36, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.73 - index * 0.045, 0.43, 0.35]} finish={index === 0 ? 'cobalt' : 'ice'} trim={trim} />)}
      {[-1, 1].map((side) => <group key={`flank-${side}`}>
        {[-0.46, -0.09, 0.28].map((z, index) => <Plate key={z} resources={resources} position={[side * 0.38, 0.03, z]} rotation={[0.08, side * Math.PI / 2, -side * 0.12]} scale={[0.47, 0.54, 0.28]} finish={index === 1 ? 'cobalt' : 'ice'} trim={trim} />)}
        <Solid resources={resources} finish="glow" shape="box" position={[side * 0.442, 0.03, -0.06]} rotation={[0, side * Math.PI / 2, 0]} scale={[0.13, 0.025, 0.02]} />
      </group>)}
      {[-0.57, -0.21, 0.15].map((z, index) => <Solid key={`spine-${z}`} resources={resources} finish="crystal" shape="crystal" position={[0, 0.38, z]} rotation={[-0.55, 0, 0]} scale={[0.22, 0.28 + index * 0.065, 0.23]} />)}
      <Plate resources={resources} position={[0, -0.22, 0.71]} rotation={[-0.12, 0, 0]} scale={[0.64, 0.7, 0.35]} trim={trim} />
      <Solid resources={resources} finish="cobalt" shape="gem" position={[0, -0.05, 0.835]} scale={[0.2, 0.29, 0.095]} />
      <Solid name="wolf-chest-gem" resources={resources} finish="glow" shape="gem" position={[0, -0.05, 0.91]} scale={[0.115, 0.18, 0.055]} />
    </group>

    {legs.map((rig, index) => <WolfLeg key={index} resources={resources} rig={rig} side={rig.side} front={rig.front} trim={trim} />)}

    <group name="wolf-neck" ref={neck} position={[0, 1.43, 0.53]}>
      <Solid resources={resources} finish="frame" rotation={[0.35, 0, 0]} position={[0, 0.2, 0.12]} scale={[0.3, 0.42, 0.29]} />
      <Plate resources={resources} position={[0, 0.22, 0.36]} rotation={[-0.28, 0, 0]} scale={[0.49, 0.53, 0.32]} trim={trim} />
      {[-1, 1].map((side) => <group key={`mane-${side}`}>
        <Plate resources={resources} position={[side * 0.25, 0.26, 0.13]} rotation={[0.05, side * Math.PI / 2, side * 0.18]} scale={[0.42, 0.61, 0.32]} trim={trim} />
        {[0, 1, 2].map((n) => <Solid key={n} resources={resources} finish={n === 1 ? 'ice' : 'crystal'} shape="crystal" position={[side * (0.23 + n * 0.045), 0.36 - n * 0.16, -0.03 - n * 0.045]} rotation={[-0.72, 0, -side * (0.52 + n * 0.15)]} scale={[0.2, 0.36 - n * 0.04, 0.22]} />)}
      </group>)}
      <group name="wolf-head" ref={head} position={[0, 0.49, 0.32]}>
        <Solid resources={resources} finish="cobalt" scale={[0.39, 0.34, 0.39]} position={[0, 0.05, 0.02]} />
        <Solid name="wolf-face-shell" resources={resources} finish="face" shape="sphere" position={[0, 0.025, 0.235]} scale={[0.355, 0.272, 0.31]} />
        <Plate resources={resources} position={[0, 0.28, 0.14]} rotation={[-0.72, 0, Math.PI]} scale={[0.56, 0.4, 0.24]} finish="cobalt" trim={trim} />
        <Solid resources={resources} finish="crystal" shape="crystal" position={[0, 0.27, -0.15]} rotation={[-0.4, 0, 0]} scale={[0.19, 0.39, 0.22]} />
        {[-1, 1].map((side, index) => <group key={`eye-${side}`}>
          <Plate resources={resources} position={[side * 0.31, -0.02, 0.08]} rotation={[0, side * 0.97, side * 0.08]} scale={[0.27, 0.49, 0.27]} trim={trim} />
          <Solid resources={resources} finish="crystal" shape="crystal" position={[side * 0.31, 0.1, -0.12]} rotation={[-0.4, 0, -side * 0.85]} scale={[0.15, 0.31, 0.18]} />
          <group name={`wolf-eye-${side < 0 ? 'left' : 'right'}`} position={[side * 0.247, 0.07, 0.37]} rotation={[0, side * 0.5, side * 0.02]}>
            <Solid resources={resources} finish="nose" shape="sphere" scale={[0.144, 0.173, 0.046]} />
            <Solid resources={resources} finish="crystal" shape="sphere" position={[0, 0, 0.025]} scale={[0.108, 0.133, 0.04]} />
            <Solid name={`wolf-eye-${side < 0 ? 'left' : 'right'}-iris`} resources={resources} finish="glow" shape="sphere" position={[0, -0.002, 0.055]} scale={[0.071, 0.105, 0.02]} />
            <Solid resources={resources} finish="face" shape="sphere" position={[0.013, -0.008, 0.074]} scale={[0.018, 0.084, 0.011]} />
            <Solid resources={resources} finish="ice" shape="sphere" position={[-0.028, 0.05, 0.076]} scale={[0.022, 0.033, 0.009]} />
            <group name={`wolf-eye-${side < 0 ? 'left' : 'right'}-upper-lid`} ref={(group) => { lids.current[index * 2] = group }} position={[0, 0.165, 0]}><Solid resources={resources} shape="upperLid" finish="face" scale={[0.148, 0.178, 0.09]} /></group>
            <group name={`wolf-eye-${side < 0 ? 'left' : 'right'}-lower-lid`} ref={(group) => { lids.current[index * 2 + 1] = group }} position={[0, -0.165, 0]}><Solid resources={resources} shape="lowerLid" finish="face" scale={[0.148, 0.178, 0.09]} /></group>
            <group name={`wolf-eye-${side < 0 ? 'left' : 'right'}-brow`} ref={(group) => { brows.current[index] = group }} position={[0, 0.15, 0.015]}><Solid resources={resources} finish="ice" shape="box" scale={[0.24, 0.046, 0.075]} /></group>
          </group>
        </group>)}

        <Solid resources={resources} finish="ice" position={[0, -0.14, 0.445]} scale={[0.23, 0.145, 0.31]} />
        <Solid resources={resources} finish="cobalt" position={[0, -0.065, 0.49]} scale={[0.135, 0.055, 0.26]} />
        <Solid resources={resources} finish="nose" position={[0, -0.095, 0.735]} scale={[0.125, 0.088, 0.095]} />
        <Solid resources={resources} finish="glow" shape="box" position={[0, -0.041, 0.746]} scale={[0.058, 0.014, 0.014]} />
        <group name="wolf-jaw" ref={jaw} position={[0, -0.19, 0.22]}>
          <Solid resources={resources} finish="nose" position={[0, -0.03, 0.22]} scale={[0.199, 0.068, 0.31]} />
          <Solid resources={resources} finish="ice" position={[0, -0.076, 0.235]} scale={[0.205, 0.066, 0.3]} />
          {[-1, 1].map((side) => <Solid key={`fang-${side}`} resources={resources} finish="ice" shape="crystal" position={[side * 0.145, -0.015, 0.365]} scale={[0.045, 0.075, 0.045]} />)}
        </group>

        {[-1, 1].map((side) => <group name={`wolf-ear-${side < 0 ? 'left' : 'right'}`} key={`ear-${side}`} ref={side < 0 ? leftEar : rightEar} position={[side * 0.255, 0.24, -0.02]} rotation={[-0.12, 0, -side * 0.17]}>
          <Solid resources={resources} finish="frame" shape="ear" scale={[0.52, 0.54, 0.7]} />
          <Solid resources={resources} finish="ice" shape="ear" position={[0, 0.025, 0.035]} scale={[0.47, 0.51, 0.6]} />
          <Solid resources={resources} finish="crystal" shape="ear" position={[0, 0.083, 0.095]} scale={[0.29, 0.35, 0.3]} />
          <Solid resources={resources} finish="glow" shape="crystal" position={[0, 0.34, 0.15]} scale={[0.045, 0.15, 0.05]} />
        </group>)}
      </group>
    </group>

    <group name="wolf-tail-0" ref={tailRoot} position={[0, 1.46, -0.84]} rotation={[-0.45, 0, 0]}>
      <Solid resources={resources} finish="frame" position={[0, -0.015, -0.19]} scale={[0.17, 0.17, 0.3]} />
      <Plate resources={resources} position={[0, 0.105, -0.14]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.31, 0.39, 0.23]} trim={trim} />
      <group name="wolf-tail-1" ref={tailMid} position={[0, -0.025, -0.4]}>
        <Solid resources={resources} finish="cobalt" position={[0, 0, -0.17]} scale={[0.145, 0.145, 0.28]} />
        <Plate resources={resources} position={[0, 0.09, -0.14]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.27, 0.34, 0.2]} trim={trim} />
        {[-1, 1].map((side) => <Solid key={`tail-fin-${side}`} resources={resources} finish="crystal" shape="crystal" position={[side * 0.1, 0.04, -0.16]} rotation={[-1.1, 0, -side * 0.8]} scale={[0.12, 0.27, 0.13]} />)}
        <group name="wolf-tail-2" ref={tailTip} position={[0, 0, -0.36]}>
          <Solid resources={resources} finish="ice" position={[0, 0, -0.15]} scale={[0.115, 0.12, 0.22]} />
          <Solid resources={resources} finish="crystal" shape="crystal" position={[0, 0, -0.23]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.22, 0.33, 0.23]} />
          <Solid resources={resources} finish="glow" shape="gem" position={[0, 0.04, -0.21]} scale={[0.05, 0.075, 0.12]} />
        </group>
      </group>
    </group>
  </group>
}
