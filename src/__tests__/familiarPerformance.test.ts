import { expect, it } from 'vitest'
import { DEFAULT_FAMILIAR_QUALITY, QUALITY_PRESETS, resolveFamiliarQuality } from '@/lib/familiarPerformance'

it('defaults to medium and respects explicit pixel ratio rather than assuming a high-DPI device', () => {
  expect(DEFAULT_FAMILIAR_QUALITY).toBe('medium')
  expect(resolveFamiliarQuality()).toEqual(QUALITY_PRESETS.medium)
  expect(resolveFamiliarQuality('cinematic', { devicePixelRatio: 1 })).toMatchObject({ dpr: 1, maxFPS: 60 })
  expect(resolveFamiliarQuality('low', { devicePixelRatio: 4 })).toMatchObject({ dpr: 1, particleBudget: 0, antialias: false })
})

it('bounds the cost of rendering eight familiars together without mutating the presets', () => {
  const before = JSON.stringify(QUALITY_PRESETS)
  const crowded = resolveFamiliarQuality('cinematic', { activeFamiliars: 8, devicePixelRatio: 4 })
  expect(crowded.dpr).toBeLessThanOrEqual(1.25)
  expect(crowded.maxFPS).toBe(60) // Explicit High/Cinematic can target 60; this is not a hardware guarantee.
  expect(resolveFamiliarQuality('medium', { activeFamiliars: 8 }).maxFPS).toBe(30)
  expect(crowded.geometryDetail).toBeLessThanOrEqual(1)
  expect(crowded.particleBudget * 8).toBeLessThanOrEqual(QUALITY_PRESETS.cinematic.particleBudget)
  expect(JSON.stringify(QUALITY_PRESETS)).toBe(before)
})

it('offscreen, off and reduced-motion rendering spend no autonomous frame or particle budget', () => {
  for (const options of [{ visible: false }, { motion: 'off' as const }, { reducedMotion: true }]) {
    expect(resolveFamiliarQuality('cinematic', options)).toMatchObject({ maxFPS: 0, particleBudget: 0 })
  }
  expect(resolveFamiliarQuality('high', { motion: 'cinematic' })).toMatchObject({ maxFPS: 60, particleBudget: 32 })
  expect(resolveFamiliarQuality('cinematic', { lowPower: true })).toEqual(QUALITY_PRESETS.medium)
})
