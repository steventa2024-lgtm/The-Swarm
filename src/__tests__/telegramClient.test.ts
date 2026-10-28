import { afterEach, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ available: false }))
const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/providers/transport', () => ({ inTauri: () => native.available }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
const { telegramInvoke } = await import('@/lib/telegramBots')

afterEach(() => { native.available = false; invoke.mockReset() })

it('refuses browser credential writes instead of pretending secure storage succeeded', async () => {
  await expect(telegramInvoke('tg_set_token', { botId: 'hq', value: 'non-secret-test-fixture' })).rejects.toThrow('desktop app')
  expect(invoke).not.toHaveBeenCalled()
})

it('propagates native connection failure instead of reporting a bot as connected', async () => {
  native.available = true
  invoke.mockRejectedValue(new Error('Telegram is unreachable'))
  await expect(telegramInvoke('tg_test_bot', { botId: 'codex' })).rejects.toThrow('unreachable')
  expect(invoke).toHaveBeenCalledTimes(1)
})

it('waits for the real native secure-store result before reporting a credential save', async () => {
  native.available = true
  invoke.mockRejectedValue(new Error('Credential manager unavailable'))
  await expect(telegramInvoke('tg_set_token', { botId: 'hq', value: 'non-secret-test-fixture' })).rejects.toThrow('Credential manager unavailable')
})
