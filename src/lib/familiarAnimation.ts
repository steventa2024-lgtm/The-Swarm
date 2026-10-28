import type { MascotState } from '@/data/familiars'

export type FamiliarMotion = 'off' | 'subtle' | 'full'
export type FamiliarMotionInput = FamiliarMotion | 'cinematic'
/** Radians for joint angles; blink/stride/crouch/focus/energy are 0..1.
 * Mood is -1..1. These are visual weights, never provider metrics or task evidence. */
export interface WolfPose {
  time: number
  breathe: number
  blink: number
  headYaw: number
  headPitch: number
  earLeft: number
  earRight: number
  tail: number
  stride: number
  crouch: number
  mood: number
  focus: number
  energy: number
}
export type FamiliarPose = WolfPose
export interface FamiliarAnimationInput {
  /** Active animation time in seconds. The caller owns visibility/pause scheduling. */
  elapsed: number
  motion?: FamiliarMotionInput
  reducedMotion?: boolean
  paused?: boolean
  pointer?: { x: number; y: number }
}

export function normalizeMotion(motion: FamiliarMotionInput | undefined): FamiliarMotion {
  return motion === 'cinematic' ? 'full' : motion === 'off' || motion === 'full' ? motion : 'subtle'
}

const REST: WolfPose = { time: 0, breathe: 0, blink: 0, headYaw: 0, headPitch: 0, earLeft: 0.08, earRight: 0.08, tail: 0.05, stride: 0, crouch: 0.04, mood: 0.2, focus: 0.4, energy: 0.3 }
const REST_POSES: Record<MascotState, WolfPose> = {
  idle: { ...REST, headPitch: -0.025, mood: 0.25, focus: 0.35, energy: 0.28 },
  thinking: { ...REST, headYaw: -0.12, headPitch: -0.09, earLeft: -0.12, earRight: 0.2, tail: 0.02, crouch: 0.13, mood: 0.08, focus: 0.9, energy: 0.48 },
  working: { ...REST, headPitch: 0.075, earLeft: 0.2, earRight: 0.2, tail: 0.16, stride: 0.55, crouch: 0.06, mood: 0.3, focus: 0.98, energy: 0.9 },
  reviewing: { ...REST, headYaw: 0.14, headPitch: 0.025, earLeft: 0.24, earRight: -0.06, tail: -0.02, crouch: 0.08, mood: 0.12, focus: 0.95, energy: 0.5 },
  waiting_approval: { ...REST, headPitch: -0.06, earLeft: 0.16, earRight: 0.16, tail: -0.04, crouch: 0.12, mood: 0.18, focus: 0.72, energy: 0.34 },
  completed: { ...REST, headPitch: -0.13, earLeft: 0.32, earRight: 0.32, tail: 0.3, stride: 0.06, crouch: 0, mood: 0.95, focus: 0.65, energy: 0.76 },
  failed: { ...REST, headPitch: 0.18, blink: 0.08, earLeft: -0.4, earRight: -0.4, tail: -0.28, crouch: 0.3, mood: -0.65, focus: 0.58, energy: 0.2 },
  offline: { ...REST, headYaw: -0.03, headPitch: 0.27, blink: 0.55, earLeft: -0.38, earRight: -0.38, tail: -0.36, crouch: 0.38, mood: -0.2, focus: 0.08, energy: 0.04 },
}
interface AnimationProfile { phase: number; breath: number; breathPeriod: number; look: number; nod: number; ears: number; wag: number; wagPeriod: number }
const PROFILES: Record<MascotState, AnimationProfile> = {
  idle: { phase: 0, breath: 0.012, breathPeriod: 4, look: 0.07, nod: 0.015, ears: 0.14, wag: 0.12, wagPeriod: 6 },
  thinking: { phase: 1.5, breath: 0.011, breathPeriod: 3.6, look: 0.035, nod: 0.025, ears: 0.1, wag: 0.045, wagPeriod: 8 },
  working: { phase: 3, breath: 0.017, breathPeriod: 2.4, look: 0.018, nod: 0.028, ears: 0.06, wag: 0.2, wagPeriod: 2.4 },
  reviewing: { phase: 4.5, breath: 0.01, breathPeriod: 4.8, look: 0.055, nod: 0.018, ears: 0.09, wag: 0.04, wagPeriod: 8 },
  waiting_approval: { phase: 6, breath: 0.011, breathPeriod: 4.8, look: 0.04, nod: 0.012, ears: 0.08, wag: 0.075, wagPeriod: 6 },
  completed: { phase: 7.5, breath: 0.016, breathPeriod: 3, look: 0.025, nod: 0.024, ears: 0.12, wag: 0.42, wagPeriod: 1.2 },
  failed: { phase: 9, breath: 0.008, breathPeriod: 5.4, look: 0.015, nod: 0.012, ears: 0.025, wag: 0.025, wagPeriod: 10 },
  offline: { phase: 10.5, breath: 0.004, breathPeriod: 6, look: 0, nod: 0, ears: 0, wag: 0, wagPeriod: 12 },
}

const LIMITS: Record<keyof WolfPose, readonly [number, number]> = {
  time: [0, 86_400], breathe: [-0.03, 0.03], blink: [0, 1], headYaw: [-0.65, 0.65], headPitch: [-0.45, 0.45],
  earLeft: [-0.8, 0.8], earRight: [-0.8, 0.8], tail: [-1.2, 1.2], stride: [0, 1], crouch: [0, 1], mood: [-1, 1], focus: [0, 1], energy: [0, 1],
}
const KEYS = Object.keys(LIMITS) as (keyof WolfPose)[]
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, finite(value, low)))
const wave = (time: number, period: number) => Math.sin(time * 2 * Math.PI / period)
function pulse(time: number, start: number, duration: number): number {
  const phase = (time - start) / duration
  return phase <= 0 || phase >= 1 ? 0 : Math.sin(Math.PI * phase) ** 2
}
function blinkAt(time: number): number {
  const t = time % 24
  // Includes an occasional double blink; the schedule is deterministic and has no timers.
  return Math.max(pulse(t, 2.35, 0.18), pulse(t, 6.8, 0.17), pulse(t, 7.15, 0.15), pulse(t, 13.9, 0.2), pulse(t, 20.2, 0.18))
}
function bounded(pose: WolfPose): WolfPose {
  const result = { ...pose }
  for (const key of KEYS) result[key] = clamp(pose[key], ...LIMITS[key])
  return result
}

/** Samples only the supplied state. Time and pointer input never create a task or change that state. */
export function sampleWolfPose(state: MascotState, input: FamiliarAnimationInput): WolfPose {
  const rest = REST_POSES[state]
  const motion = normalizeMotion(input.motion)
  if (motion === 'off' || input.reducedMotion || input.paused) return { ...rest }
  const profile = PROFILES[state]
  const time = Math.max(0, finite(input.elapsed)) % 86_400
  const t = time + profile.phase
  const amount = motion === 'full' ? 1 : 0.35
  const pointerX = clamp(finite(input.pointer?.x ?? 0), -1, 1)
  const pointerY = clamp(finite(input.pointer?.y ?? 0), -1, 1)
  const earCycle = t % 24
  const blink = blinkAt(t)
  return bounded({
    ...rest,
    time,
    breathe: amount * profile.breath * wave(t, profile.breathPeriod),
    blink: rest.blink + (1 - rest.blink) * blink,
    headYaw: rest.headYaw + amount * (pointerX * 0.2 * rest.focus + wave(t, 8) * profile.look),
    headPitch: rest.headPitch + amount * (-pointerY * 0.12 * rest.focus + wave(t, 6) * profile.nod),
    earLeft: rest.earLeft + amount * profile.ears * (pulse(earCycle, 4.7, 0.45) - 0.45 * pulse(earCycle, 16.9, 0.6)),
    earRight: rest.earRight + amount * profile.ears * (pulse(earCycle, 10.2, 0.5) - 0.35 * pulse(earCycle, 21.6, 0.4)),
    tail: rest.tail + amount * profile.wag * wave(t, profile.wagPeriod),
    stride: rest.stride * (1 - amount * 0.15 + amount * 0.15 * wave(t, 0.8)),
  })
}
export const sampleFamiliarPose = sampleWolfPose

/** Endpoint-flat easing keeps state changes smooth without overshooting joint limits. */
export function blendPose(from: WolfPose, to: WolfPose, progress: number): WolfPose {
  const t = clamp(progress, 0, 1)
  if (t === 0) return bounded(from)
  if (t === 1) return bounded(to)
  const eased = t * t * t * (t * (t * 6 - 15) + 10)
  const result = { ...from }
  for (const key of KEYS) {
    const a = clamp(from[key], ...LIMITS[key]), b = clamp(to[key], ...LIMITS[key])
    result[key] = a + (b - a) * eased
  }
  return result
}

/** elapsed and duration are seconds since a real state transition, not global clock time. */
export function transitionPose(from: WolfPose, to: WolfPose, elapsed: number, duration = 0.35): WolfPose {
  return blendPose(from, to, !Number.isFinite(duration) || duration <= 0 ? 1 : finite(elapsed) / duration)
}
