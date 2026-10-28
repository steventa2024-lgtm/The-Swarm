import { expect, it } from 'vitest'
import { approvalExpired } from '@/lib/approvalExpiry'

it('revokes UI actions exactly at the native epoch-second deadline', () => {
  const deadline = 1_800_000_900
  expect(approvalExpired(deadline, deadline * 1000 - 1)).toBe(false)
  expect(approvalExpired(deadline, deadline * 1000)).toBe(true)
})

it('shows a revision as expired after desktop sleep without counting timer ticks', () => {
  const requestedAt = 1_800_000_000_000
  const deadline = requestedAt / 1000 + 15 * 60
  expect(approvalExpired(deadline, requestedAt)).toBe(false)
  expect(approvalExpired(deadline, requestedAt + 2 * 60 * 60 * 1000)).toBe(true)
  // A Telegram intent cannot extend the same immutable revision's deadline.
  expect(approvalExpired(deadline, requestedAt + 2 * 60 * 60 * 1000 + 1)).toBe(true)
})

it('does not treat malformed deadlines as ongoing owner authority', () => {
  expect(approvalExpired(Number.NaN, Date.now())).toBe(true)
  expect(approvalExpired(0, Date.now())).toBe(true)
  // A proposal that has not been staged yet has no approval deadline.
  expect(approvalExpired(null, Date.now())).toBe(false)
})
