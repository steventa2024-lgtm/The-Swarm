import { normalizeMotion, type FamiliarMotionInput } from './familiarAnimation'

export type FamiliarQuality = 'low' | 'medium' | 'high' | 'cinematic'
export interface FamiliarQualityPreset {
  dpr: number
  maxFPS: number
  particleBudget: number
  antialias: boolean
  geometryDetail: number
}
export const DEFAULT_FAMILIAR_QUALITY: FamiliarQuality = 'medium'
export const QUALITY_PRESETS: Readonly<Record<FamiliarQuality, Readonly<FamiliarQualityPreset>>> = {
  low: { dpr: 1, maxFPS: 24, particleBudget: 0, antialias: false, geometryDetail: 0 },
  medium: { dpr: 1.25, maxFPS: 30, particleBudget: 12, antialias: true, geometryDetail: 1 },
  high: { dpr: 1.75, maxFPS: 60, particleBudget: 32, antialias: true, geometryDetail: 2 },
  cinematic: { dpr: 2, maxFPS: 60, particleBudget: 64, antialias: true, geometryDetail: 3 },
}

export interface FamiliarPerformanceOptions {
  devicePixelRatio?: number
  activeFamiliars?: number
  motion?: FamiliarMotionInput
  reducedMotion?: boolean
  visible?: boolean
  lowPower?: boolean
}

/** Explicit quality budgets, not guessed GPU capabilities. Zero FPS means demand rendering. */
export function resolveFamiliarQuality(quality: FamiliarQuality = DEFAULT_FAMILIAR_QUALITY, options: FamiliarPerformanceOptions = {}): FamiliarQualityPreset {
  const selected = options.lowPower && ['high', 'cinematic'].includes(quality) ? 'medium' : quality
  const preset = QUALITY_PRESETS[selected]
  const ratio = Number.isFinite(options.devicePixelRatio) && (options.devicePixelRatio ?? 0) > 0 ? Math.max(0.5, options.devicePixelRatio!) : preset.dpr
  const count = Number.isFinite(options.activeFamiliars) ? Math.max(1, Math.min(8, Math.floor(options.activeFamiliars!))) : 1
  const animate = options.visible !== false && !options.reducedMotion && normalizeMotion(options.motion) !== 'off'
  return {
    dpr: Math.min(preset.dpr, ratio, count >= 5 ? 1.25 : count >= 3 ? 1.5 : 2),
    maxFPS: !animate ? 0 : preset.maxFPS,
    particleBudget: !animate ? 0 : Math.floor(preset.particleBudget / count),
    antialias: preset.antialias,
    geometryDetail: count >= 5 ? Math.min(1, preset.geometryDetail) : preset.geometryDetail,
  }
}
