import { beforeEach, expect, it, vi } from 'vitest'
import { createRun } from '@/engine/simulator'
import { seedAgents, seedProviders } from '@/data/seed'
const memory = new Map<string,string>()
let failWrites = false
vi.mock('@/persistence/storage', () => ({ recorderStorage: { getItem: async (k:string) => memory.get(k) ?? null, setItem: async (k:string,v:string) => { if (failWrites) throw new Error('Disk full'); memory.set(k,v) }, removeItem: async (k:string) => { memory.delete(k) } } }))
const { recordFrame, loadFlight, recoverFlight, clearFlights } = await import('@/persistence/flightRecorder')
beforeEach(async () => { failWrites = false; await clearFlights(); memory.clear() })
it('records ordered state, masks credentials and recovers without executing tools', async () => {
  const {run} = createRun({prompt:'Build a page',projectId:'p',mode:'balanced',requestedAgents:2,attachments:[]}, {providers:seedProviders,agents:seedAgents,maxWorkers:2,getSpeed:()=>1})
  run.task.prompt = 'key sk-proj-abcdefghijklmnopqrstuvwxyz0123456789'
  await recordFrame(run); run.status='running'; await recordFrame(run)
  const frames = (await loadFlight(run.id))!.frames
  expect(frames.map((f)=>f.status)).toEqual(['planning','running'])
  expect(JSON.stringify(frames)).not.toContain('sk-proj-')
  const recovered = await recoverFlight()
  expect(recovered?.status).toBe('stopped'); expect(recovered?.events[0].message).toMatch(/No tools or approvals/)
})
it('does not recover completed sessions', async () => {
  const {run} = createRun({prompt:'Build a page',projectId:'p',mode:'balanced',requestedAgents:2,attachments:[]}, {providers:seedProviders,agents:seedAgents,maxWorkers:2,getSpeed:()=>1})
  run.status='completed'; await recordFrame(run); expect(await recoverFlight()).toBeNull()
})
it('recovers each interrupted project independently without replaying authority', async () => {
  const make = (projectId: string) => createRun({prompt:'Small fixture',projectId,mode:'balanced',requestedAgents:2,attachments:[]}, {providers:seedProviders,agents:seedAgents,maxWorkers:2,getSpeed:()=>1}).run
  const one = make('one'), two = make('two')
  await recordFrame(one); await recordFrame(two)
  expect((await recoverFlight(one.id))?.task.projectId).toBe('one')
  expect((await recoverFlight(two.id))?.task.projectId).toBe('two')
  expect((await recoverFlight(one.id))?.status).toBe('stopped')
})
it('reports failed checkpoints and can retry the same frame after storage recovers', async () => {
  const {run} = createRun({prompt:'Build a page',projectId:'p',mode:'balanced',requestedAgents:2,attachments:[]}, {providers:seedProviders,agents:seedAgents,maxWorkers:2,getSpeed:()=>1})
  failWrites = true
  await expect(recordFrame(run)).rejects.toThrow('Disk full')
  failWrites = false
  await recordFrame(run)
  expect((await loadFlight(run.id))?.frames).toHaveLength(1)
})
