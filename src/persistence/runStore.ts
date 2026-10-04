import { redactText } from '@/lib/redact'
import type { Run, RunStatus } from '@/types'
import { appStorage } from './storage'

/**
 * Full finished runs (files the agents wrote, events, final output) so they survive closing the app and can be
 * reopened, re-previewed or applied. Kept apart from the main persisted blob so saving a run never rewrites
 * your settings, and so each run can be dropped independently.
 */

export const MAX_RUNS = 25
/** Total proposed-file text kept per run. Past this, later files keep their paths and stats but not their contents. */
export const MAX_CONTENT_BYTES = 1_500_000
const MAX_EVENTS = 200

const INDEX_KEY = 'zp-runs/index'
const runKey = (id: string) => `zp-runs/${id}`

export interface StoredRunMeta {
  id: string
  title: string
  projectId: string
  status: RunStatus
  startedAt: number
  files: number
  /** True if some file contents were dropped for size. */
  trimmed: boolean
}

async function readIndex(): Promise<StoredRunMeta[]> {
  try {
    const raw = await appStorage.getItem(INDEX_KEY)
    const parsed = raw ? JSON.parse(raw as string) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
const writeIndex = (list: StoredRunMeta[]) => Promise.resolve(appStorage.setItem(INDEX_KEY, JSON.stringify(list)))

/** Prepares a run for storage: bounded in size, and with secrets masked when asked. */
export function prepareForStorage(run: Run, opts: { redact: boolean }): { run: Run; trimmed: boolean } {
  const r = opts.redact
  // Prompts, logs and summaries get the strict pass. File contents only lose unmistakable credentials, so
  // the code you may re-apply later isn't rewritten.
  const strict = (s: string) => (r ? redactText(s, 'strict') : s)
  const tokens = (s: string) => (r ? redactText(s, 'tokens') : s)

  let budget = MAX_CONTENT_BYTES
  let trimmed = false
  const fileChanges = run.fileChanges.map((f) => {
    if (f.content === undefined) return f
    if (f.content.length > budget) { trimmed = true; return { ...f, content: undefined } }
    budget -= f.content.length
    return { ...f, content: tokens(f.content) }
  })

  const out: Run = {
    ...run,
    task: { ...run.task, prompt: strict(run.task.prompt), title: strict(run.task.title) },
    events: run.events.slice(0, MAX_EVENTS).map((e) => ({ ...e, message: strict(e.message) })),
    workers: run.workers.map((w) => ({ ...w, summary: strict(w.summary), brief: w.brief ? strict(w.brief) : w.brief, recentAction: strict(w.recentAction) })),
    fileChanges,
    finalOutput: run.finalOutput && {
      ...run.finalOutput,
      headline: strict(run.finalOutput.headline),
      summary: run.finalOutput.summary.map(strict),
      nextSteps: run.finalOutput.nextSteps.map(strict),
    },
  }
  return { run: out, trimmed }
}

export async function saveRun(run: Run, opts: { redact: boolean }): Promise<void> {
  const { run: prepared, trimmed } = prepareForStorage(run, opts)
  await appStorage.setItem(runKey(run.id), JSON.stringify(prepared))

  const meta: StoredRunMeta = {
    id: run.id, title: prepared.task.title, projectId: run.task.projectId, status: run.status, startedAt: run.startedAt,
    files: new Set(run.fileChanges.map((f) => f.path)).size, trimmed,
  }
  const list = [meta, ...(await readIndex()).filter((m) => m.id !== run.id)].sort((a, b) => b.startedAt - a.startedAt)
  // Keep the newest MAX_RUNS; delete the rest so storage doesn't grow without bound.
  for (const old of list.slice(MAX_RUNS)) await appStorage.removeItem(runKey(old.id))
  await writeIndex(list.slice(0, MAX_RUNS))
}

export const listRuns = readIndex

export async function loadRun(id: string): Promise<Run | null> {
  try {
    const raw = await appStorage.getItem(runKey(id))
    return raw ? (JSON.parse(raw as string) as Run) : null
  } catch {
    return null
  }
}

export async function deleteRun(id: string): Promise<void> {
  await appStorage.removeItem(runKey(id))
  await writeIndex((await readIndex()).filter((m) => m.id !== id))
}

export async function clearRuns(): Promise<number> {
  const list = await readIndex()
  for (const m of list) await appStorage.removeItem(runKey(m.id))
  await writeIndex([])
  return list.length
}
