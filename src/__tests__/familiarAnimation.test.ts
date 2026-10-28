import { expect, it } from 'vitest'
import { MASCOT_STATES, mascotState } from '@/data/familiars'
import { blendPose, normalizeMotion, sampleWolfPose, transitionPose } from '@/lib/familiarAnimation'
import { createRun } from '@/engine/simulator'
import { seedAgents, seedProviders } from '@/data/seed'

it('keeps each actual workflow state visually distinct while time cannot advance its authority', () => {
  const rests = MASCOT_STATES.map((state) => sampleWolfPose(state, { elapsed: 0, motion: 'off' }))
  expect(new Set(rests.map((pose) => JSON.stringify(pose))).size).toBe(MASCOT_STATES.length)
  const waiting = sampleWolfPose('waiting_approval', { elapsed: 0, motion: 'full' })
  const later = sampleWolfPose('waiting_approval', { elapsed: 90_000, motion: 'full' })
  expect(later.mood).toBe(waiting.mood)
  expect(later.focus).toBe(waiting.focus)
  expect(later.energy).toBe(waiting.energy)
  expect(later.stride).toBe(0)
  expect(sampleWolfPose('working', { elapsed: 5, motion: 'full' }).stride).toBeGreaterThan(0.3)
  expect(sampleWolfPose('failed', { elapsed: 5, motion: 'full' }).mood).toBeLessThan(0)
})

it('off, reduced motion and pause freeze all autonomous and pointer motion without erasing state', () => {
  for (const state of MASCOT_STATES) {
    const rest = sampleWolfPose(state, { elapsed: 0, motion: 'off' })
    for (const frozen of [{ motion: 'off' as const }, { motion: 'full' as const, reducedMotion: true }, { motion: 'full' as const, paused: true }]) {
      expect(sampleWolfPose(state, { elapsed: 123, pointer: { x: 1, y: -1 }, ...frozen })).toEqual(rest)
      expect(sampleWolfPose(state, { elapsed: 12_345, pointer: { x: -1, y: 1 }, ...frozen })).toEqual(rest)
    }
  }
})

it('samples deterministic breathing, brief blinks, ear flicks and idle tail movement', () => {
  const options = { elapsed: 2.44, motion: 'full' as const }
  expect(sampleWolfPose('idle', options)).toEqual(sampleWolfPose('idle', options))
  expect(sampleWolfPose('idle', options).blink).toBeGreaterThan(0.95)
  expect(sampleWolfPose('idle', { elapsed: 2, motion: 'full' }).blink).toBe(0)
  const before = sampleWolfPose('idle', { elapsed: 0, motion: 'full' })
  const after = sampleWolfPose('idle', { elapsed: 4.925, motion: 'full' })
  expect(after.breathe).not.toBe(before.breathe)
  expect(after.earLeft).toBeGreaterThan(before.earLeft)
  expect(after.tail).not.toBe(before.tail)
  expect(after.stride).toBe(0)
})

it('normalizes legacy cinematic motion and bounds pointer/joint values on extreme input', () => {
  expect(normalizeMotion('cinematic')).toBe('full')
  expect(normalizeMotion(undefined)).toBe('subtle')
  const regular = sampleWolfPose('idle', { elapsed: 1, motion: 'full', pointer: { x: 1, y: -1 } })
  expect(sampleWolfPose('idle', { elapsed: 1, motion: 'cinematic', pointer: { x: 900, y: -900 } })).toEqual(regular)
  for (const state of MASCOT_STATES) {
    for (const elapsed of [-10, Number.NaN, Number.POSITIVE_INFINITY, 1e100]) {
      const pose = sampleWolfPose(state, { elapsed, motion: 'full', pointer: { x: Number.NaN, y: Number.POSITIVE_INFINITY } })
      expect(Object.values(pose).every(Number.isFinite)).toBe(true)
      expect(pose.blink).toBeGreaterThanOrEqual(0)
      expect(pose.blink).toBeLessThanOrEqual(1)
      expect(Math.abs(pose.headYaw)).toBeLessThanOrEqual(0.65)
      expect(Math.abs(pose.headPitch)).toBeLessThanOrEqual(0.45)
    }
  }
})

it('transitions finish at the specified duration, never overshoot and preserve both inputs', () => {
  const from = sampleWolfPose('offline', { elapsed: 0, motion: 'off' })
  const to = sampleWolfPose('completed', { elapsed: 0, motion: 'off' })
  const snapshot = JSON.stringify({ from, to })
  expect(transitionPose(from, to, 0, 0.4)).toEqual(from)
  expect(transitionPose(from, to, 0.4, 0.4)).toEqual(to)
  expect(transitionPose(from, to, 1, 0.4)).toEqual(to)
  expect(transitionPose(from, to, 1, 0)).toEqual(to)
  expect(transitionPose(from, to, -1, 0.4)).toEqual(from)
  const middle = transitionPose(from, to, 0.2, 0.4)
  expect(middle.energy).toBeCloseTo((from.energy + to.energy) / 2)
  for (let i = 0; i <= 20; i++) {
    const pose = blendPose(from, to, i / 20)
    for (const key of Object.keys(from) as (keyof typeof from)[]) {
      expect(pose[key]).toBeGreaterThanOrEqual(Math.min(from[key], to[key]) - 1e-10)
      expect(pose[key]).toBeLessThanOrEqual(Math.max(from[key], to[key]) + 1e-10)
    }
  }
  expect(JSON.stringify({ from, to })).toBe(snapshot)
})

it('simulated execution is not promoted to a real working gait', () => {
  const run = createRun({ prompt: 'fixture', projectId: 'p', mode: 'balanced', requestedAgents: 2, attachments: [] }, { providers: seedProviders, agents: seedAgents, maxWorkers: 2, getSpeed: () => 1 }).run
  run.source = 'simulation'; run.workers[0].providerId = 'codex'; run.workers[0].status = 'working'
  const provider = { ...seedProviders[0], id: 'codex', verified: true, status: 'connected' as const }
  const state = mascotState('codex', [provider], run, false)
  expect(state).toBe('idle')
  expect(sampleWolfPose(state, { elapsed: 20, motion: 'full' }).stride).toBe(0)
})
