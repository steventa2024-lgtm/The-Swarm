import type { Run } from '@/types'
import { recorderStorage as appStorage } from './storage'
import { prepareForStorage } from './runStore'

export interface FlightRecord { version: 1; id: string; frames: Run[]; updatedAt: number }
const INDEX = 'swarm-flight/index'
const key = (id: string) => `swarm-flight/${id}`
let pending = Promise.resolve()
const signatures = new Map<string, string>()

/** Serial commits prevent an older async snapshot overwriting a newer one. Replay never executes tools. */
export function recordFrame(run: Run): Promise<void> {
  const signature = `${run.status}:${run.events[0]?.id}:${run.workers.map((w) => w.status).join(',')}`
  if (signatures.get(run.id) === signature) return pending
  signatures.set(run.id, signature)
  const snapshot = prepareForStorage(structuredClone(run), { redact: true }).run
  pending = pending.catch(() => {}).then(async () => {
    const prior = await loadFlight(run.id)
    const frames = [...(prior?.frames ?? []), snapshot].slice(-80)
    // Keep full proposals only in the latest frame, bounding storage during streaming.
    for (const frame of frames.slice(0, -1)) frame.fileChanges = frame.fileChanges.map((f) => ({ ...f, content: undefined }))
    const record: FlightRecord = { version: 1, id: run.id, frames, updatedAt: Date.now() }
    await appStorage.setItem(key(run.id), JSON.stringify(record))
    const ids = [run.id, ...(await listFlights()).filter((id) => id !== run.id)]
    for (const id of ids.slice(20)) await appStorage.removeItem(key(id))
    await appStorage.setItem(INDEX, JSON.stringify(ids.slice(0, 20)))
  }).catch((error) => {
    if (signatures.get(run.id) === signature) signatures.delete(run.id)
    throw error
  })
  return pending
}

export async function listFlights(): Promise<string[]> {
  const raw = await appStorage.getItem(INDEX)
  try { const ids: unknown = JSON.parse(raw as string || '[]'); return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === 'string') : [] } catch { return [] }
}
export async function loadFlight(id: string): Promise<FlightRecord | null> {
  const raw = await appStorage.getItem(key(id))
  try { const r = JSON.parse(raw as string || 'null'); return r?.version === 1 && Array.isArray(r.frames) ? r : null } catch { return null }
}
export async function clearFlights() {
  await pending.catch(() => {})
  for (const id of await listFlights()) await appStorage.removeItem(key(id))
  await appStorage.removeItem(INDEX); signatures.clear()
}
export async function recoverFlight(): Promise<Run | null> {
  const id = (await listFlights())[0]
  if (!id) return null
  const last = (await loadFlight(id))?.frames.at(-1)
  if (!last || !['planning', 'running', 'reviewing', 'paused'].includes(last.status)) return null
  return { ...last, status: 'stopped', workers: last.workers.map((w) => ({ ...w, status: w.status === 'done' ? 'done' : 'idle' })), events: [{ id: `recovered-${last.id}`, kind: 'warning', at: last.elapsedMs, taskId: last.task.id, message: 'Recovered after interruption. No tools or approvals were replayed. Resume creates a new reviewed proposal.' }, ...last.events] }
}
