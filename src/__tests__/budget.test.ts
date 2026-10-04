import { describe, expect, it } from 'vitest'
import { seedHistory, seedProviders } from '@/data/seed'
import { budgetLevel, isSample, paidTokens, usedLast24h } from '@/lib/budget'
import type { Metrics, RunSummary } from '@/types'

const metrics = (byProvider: { providerId: string; tokens: number }[]): Metrics => ({
  tokensIn: 0, tokensOut: 0, costUsd: 0, throughput: 0, tokenSeries: [], costSeries: [], throughputSeries: [],
  byProvider: byProvider.map((u) => ({ ...u, cost: 0 })), filesChanged: 0, additions: 0, deletions: 0,
})
const run = (over: Partial<RunSummary>): RunSummary => ({
  id: 'r', title: 't', projectId: 'p', mode: 'balanced', status: 'completed', agentCount: 3, durationMs: 1, tokens: 1000, costUsd: 0, startedAt: Date.now() - 1000, ...over,
})

describe('paidTokens', () => {
  it('counts only providers that are not local', () => {
    const m = metrics([{ providerId: 'openai', tokens: 5000 }, { providerId: 'ollama', tokens: 90_000 }, { providerId: 'anthropic', tokens: 2000 }])
    expect(paidTokens(m, seedProviders)).toBe(7000)
  })
  it('is zero for an all-local run and for no metrics', () => {
    expect(paidTokens(metrics([{ providerId: 'ollama', tokens: 50_000 }]), seedProviders)).toBe(0)
    expect(paidTokens(undefined, seedProviders)).toBe(0)
  })
})

describe('usedLast24h', () => {
  it('sums paid tokens of real runs from the last 24 hours', () => {
    const now = Date.now()
    const h = [run({ id: 'a', tokens: 4000, paidTokens: 1000 }), run({ id: 'b', tokens: 3000 }), run({ id: 'old', tokens: 9999, startedAt: now - 25 * 3_600_000 })]
    expect(usedLast24h(h, now)).toBe(1000 + 3000) // paidTokens wins; falls back to tokens
  })
  it('does not count local-only runs (paidTokens = 0)', () => {
    expect(usedLast24h([run({ tokens: 80_000, paidTokens: 0 })])).toBe(0)
  })
  it('ignores the sample history that ships with the app, and simulated runs', () => {
    expect(seedHistory.every(isSample)).toBe(true)
    expect(usedLast24h(seedHistory)).toBe(0)
    expect(usedLast24h([run({ tokens: 5000, simulated: true })])).toBe(0)
  })
})

describe('budgetLevel', () => {
  it('moves from ok to warn at 80% and over at 100%', () => {
    expect(budgetLevel(100, 1000, 'strict').level).toBe('ok')
    expect(budgetLevel(800, 1000, 'strict').level).toBe('warn')
    expect(budgetLevel(1000, 1000, 'balanced').level).toBe('over')
  })
  it('is off when the budget is disabled', () => {
    expect(budgetLevel(5_000_000, 1000, 'unlimited').level).toBe('off')
  })
  it('handles a zero limit without dividing by zero', () => {
    expect(budgetLevel(10, 0, 'strict').pct).toBe(0)
  })
})
