/** Native approval deadlines are epoch seconds. Missing metadata never renews a revision. */
export function approvalExpired(expiresAt: number | null, nowMs: number): boolean {
  return expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= 0 || nowMs >= expiresAt * 1000)
}
