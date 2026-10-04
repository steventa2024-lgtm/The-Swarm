/**
 * Runs a project's own checks (tests, type-check, lint, build) in an approved folder.
 * Desktop only. The Rust side offers a fixed menu — the webview never sends a command line.
 */
import { inTauri } from '@/providers/transport'

export interface CheckInfo {
  id: string
  label: string
  /** What will actually run (shown before the user presses Run). */
  command: string
  note: string | null
}

export interface CheckResult {
  ok: boolean
  exit_code: number | null
  timed_out: boolean
  cancelled: boolean
  duration_ms: number
  output: string
}

let counter = 0

async function core() {
  if (!inTauri()) throw new Error('Running checks needs the desktop app')
  return import('@tauri-apps/api/core')
}

export async function detectChecks(root: string): Promise<CheckInfo[]> {
  const { invoke } = await core()
  return invoke<CheckInfo[]>('detect_checks', { root })
}

/** Starts a check. `onOutput` receives live text; `cancel()` stops it (the process tree is killed). */
export function runCheck(root: string, id: string, onOutput: (chunk: string) => void) {
  const runId = `chk_${Date.now().toString(36)}_${(counter++).toString(36)}`
  const promise = (async () => {
    const { invoke, Channel } = await core()
    const channel = new Channel<string>()
    channel.onmessage = onOutput
    return invoke<CheckResult>('run_check', { root, id, runId, onOutput: channel })
  })()
  const cancel = () => { void core().then(({ invoke }) => invoke('cancel_check', { runId })) }
  return { promise, cancel }
}

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g

/**
 * Turns a failing check into a prompt the team can act on. The planner reads the real files
 * from the project folder, so this only needs to carry the failure and the original intent.
 */
export function buildFixPrompt(opts: { label: string; output: string; originalTask?: string; timedOut?: boolean }): string {
  const clean = opts.output.replace(ANSI, '').replace(/\r/g, '').trim()
  const excerpt = clean.length > 3500 ? `…${clean.slice(-3500)}` : clean
  return [
    `Fix the failing check in this project. Change only what is needed to make it pass.`,
    ``,
    `Check: \`${opts.label}\`${opts.timedOut ? ' (it timed out — look for hangs or an unfinished watch mode)' : ''}`,
    `Output (end of log):`,
    '```',
    excerpt || '(no output)',
    '```',
    opts.originalTask ? `\nFor context, the original task was: ${opts.originalTask.slice(0, 600)}` : '',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n')
}

export const formatDurationMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`)
