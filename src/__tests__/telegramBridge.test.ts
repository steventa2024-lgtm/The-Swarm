import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Run } from '@/types'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(async (_command: string, _args?: Record<string, unknown>) => undefined), listeners: new Map<string, (event: { payload: unknown }) => void>() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: async (name: string, handler: (event: { payload: unknown }) => void) => { mocks.listeners.set(name, handler); return () => { mocks.listeners.delete(name) } } }))
import { useSwarm } from '@/store/swarm'
import { connectTelegramWorkspace } from '@/lib/telegramBridge'
import { createRun } from '@/engine/simulator'
import { seedAgents, seedProviders } from '@/data/seed'

let disconnect: (() => void) | undefined
const pauses = vi.fn(() => { useSwarm.setState((s) => ({ run: s.run && { ...s.run, status: 'paused' } })) })
const resumes = vi.fn(() => { useSwarm.setState((s) => ({ run: s.run && { ...s.run, status: 'running' } })) })
const originalPause = useSwarm.getState().pause, originalResume = useSwarm.getState().resume
beforeEach(() => { (globalThis as unknown as { window: unknown }).window = globalThis; mocks.invoke.mockClear(); pauses.mockClear(); resumes.mockClear() })
afterEach(() => { disconnect?.(); disconnect = undefined; useSwarm.getState().reset(); useSwarm.setState({ pause: originalPause, resume: originalResume }) })
function run(): Run { return { ...createRun({ prompt: 'PRIVATE_BRIEF', projectId: 'project-1', mode: 'balanced', requestedAgents: 2, attachments: [] }, { providers: seedProviders, agents: seedAgents, maxWorkers: 2, getSpeed: () => 1 }).run, source: 'live', status: 'running' } }
async function command(runId: string, value: string) { mocks.listeners.get('tg-command')!({ payload: { requestId: 'request-1', runId, command: value } }); await Promise.resolve() }

it('binds remote pause/resume to the current live run and reports actual controller state', async () => {
  const active = run()
  useSwarm.setState({ run: active, runIsLive: true, replaying: false, pause: pauses, resume: resumes })
  disconnect = await connectTelegramWorkspace()
  await command(active.id, 'pause')
  expect(pauses).toHaveBeenCalledOnce()
  expect(mocks.invoke).toHaveBeenCalledWith('tg_command_result', { requestId: 'request-1', runId: active.id, applied: true })
  await command(active.id, 'resume')
  expect(resumes).toHaveBeenCalledOnce()
  expect(useSwarm.getState().run?.status).toBe('running')
})
it('rejects stale controls and replay and publishes each real event once', async () => {
  const active = run()
  useSwarm.setState({ run: active, runIsLive: true, replaying: false, pause: pauses })
  disconnect = await connectTelegramWorkspace()
  await command('another-run', 'pause')
  expect(pauses).not.toHaveBeenCalled()
  useSwarm.setState({ run: { ...active, elapsedMs: 100 } })
  const events = mocks.invoke.mock.calls.filter(([name]) => name === 'tg_publish_event')
  expect(events).toHaveLength(1)
  expect(JSON.stringify(events)).not.toContain('PRIVATE_BRIEF')
  useSwarm.setState({ replaying: true, runIsLive: false })
  await command(active.id, 'pause')
  expect(pauses).not.toHaveBeenCalled()
  expect(mocks.invoke).toHaveBeenLastCalledWith('tg_command_result', { requestId: 'request-1', runId: active.id, applied: false })
})
it('opens the exact staged revision for a Telegram Review action without approving it', async () => {
  const active = { ...run(), status: 'completed' as const, reviewVerdict: 'approved' as const }
  useSwarm.setState({ run: active, runIsLive: false, replaying: false })
  disconnect = await connectTelegramWorkspace()
  mocks.listeners.get('tg-review')!({ payload: { runId: active.id, approvalId: 'exact-revision' } })
  expect(useSwarm.getState().reviewApprovalId).toBe('exact-revision')
  expect(useSwarm.getState().applyOpen).toBe(true)
  expect(mocks.invoke.mock.calls.some(([name]) => name === 'fs_apply')).toBe(false)
})
