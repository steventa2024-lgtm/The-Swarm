import type { Metrics, Preferences, Provider, RunSummary } from '@/types'

/**
 * The budget exists to limit *paid* API usage. Tokens from local models cost nothing, so they are not counted,
 * and neither are simulated runs or the sample history that ships with the app.
 */
const DAY = 24 * 3_600_000

/** Tokens in this run that went to paid (non-local) providers. */
export function paidTokens(metrics: Metrics | undefined, providers: Provider[]): number {
  if (!metrics) return 0
  const local = new Set(providers.filter((p) => p.local).map((p) => p.id))
  return Math.round(metrics.byProvider.filter((u) => !local.has(u.providerId)).reduce((s, u) => s + u.tokens, 0))
}

/** Sample / simulated entries never count toward a real budget. */
export const isSample = (r: RunSummary) => r.simulated === true || r.id.startsWith('run-h')

/** Paid tokens used by recorded runs in the last 24 hours. */
export function usedLast24h(history: RunSummary[], now = Date.now()): number {
  return history
    .filter((r) => !isSample(r) && r.startedAt > now - DAY)
    .reduce((s, r) => s + (r.paidTokens ?? r.tokens), 0)
}

export type BudgetLevel = 'off' | 'ok' | 'warn' | 'over'

export function budgetLevel(used: number, limit: number, mode: Preferences['tokenBudgetMode']): { level: BudgetLevel; pct: number } {
  const pct = limit > 0 ? (used / limit) * 100 : 0
  if (mode === 'unlimited') return { level: 'off', pct }
  return { level: pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok', pct }
}
