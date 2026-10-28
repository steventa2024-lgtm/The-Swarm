import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { FamiliarId, MascotState } from '@/data/familiars'
import { sampleFamiliarPose, type FamiliarPose } from '@/lib/familiarAnimation'
import { CodexWolf } from './CodexWolf'
import { QuadrupedFamiliar } from './QuadrupedFamiliars'
import { AerialFamiliar } from './AerialFamiliars'
import { AquaticFamiliar } from './AquaticFamiliars'

export function FamiliarRig({ id, state, motion, reduced, active, detail }: { id: FamiliarId; state: MascotState; motion: 'off' | 'subtle' | 'full' | 'cinematic'; reduced: boolean; active: boolean; detail: number }) {
  const pointer = useThree((s) => s.pointer)
  const time = useRef(0), pose = useRef<FamiliarPose>(sampleFamiliarPose(state, { elapsed: 0, motion, reducedMotion: reduced }))
  useFrame((_, delta) => {
    if (active && motion !== 'off' && !reduced && state !== 'offline') time.current += Math.min(delta, 0.08)
    const next = sampleFamiliarPose(state, { elapsed: time.current, motion, reducedMotion: reduced, paused: !active || state === 'offline', pointer: { x: pointer.x, y: pointer.y } })
    const alpha = motion === 'off' || reduced || !active ? 1 : 1 - Math.exp(-Math.min(delta, 0.08) * 10)
    for (const key of Object.keys(next) as (keyof FamiliarPose)[]) {
      if (key === 'blink') pose.current[key] = next[key] // The sampled blink is already a smooth short pulse.
      else pose.current[key] += (next[key] - pose.current[key]) * alpha
    }
  }, -1)
  if (id === 'codex') return <CodexWolf pose={pose} detail={detail} />
  if (id === 'gemini' || id === 'cursor' || id === 'grok') return <QuadrupedFamiliar id={id} pose={pose} detail={detail} />
  if (id === 'hq' || id === 'claude') return <AerialFamiliar id={id} pose={pose} detail={detail} />
  return <AquaticFamiliar id={id} pose={pose} detail={detail} />
}
