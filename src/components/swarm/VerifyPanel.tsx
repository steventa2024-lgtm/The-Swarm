import { CheckCircle2, Loader2, Play, ShieldCheck, Square, Wrench, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { buildFixPrompt, detectChecks, formatDurationMs, runCheck, type CheckInfo, type CheckResult } from '@/lib/checks'
import { cn } from '@/lib/utils'
import { useSwarm } from '@/store/swarm'

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g
const MAX_UI_OUTPUT = 40_000

/** After applying, run the project's own checks and show the real output. */
export function VerifyPanel({ root, task }: { root: string; task?: string }) {
  const [checks, setChecks] = useState<CheckInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [output, setOutput] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, CheckResult>>({})
  const cancel = useRef<(() => void) | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let alive = true
    detectChecks(root).then((c) => alive && setChecks(c)).catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => { alive = false }
  }, [root])

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }) }, [output])

  const run = async (c: CheckInfo) => {
    setRunning(c.id); setShown(c.id); setOutput(''); setError(null)
    const handle = runCheck(root, c.id, (chunk) => setOutput((o) => (o + chunk.replace(ANSI, '')).slice(-MAX_UI_OUTPUT)))
    cancel.current = handle.cancel
    try {
      const res = await handle.promise
      setResults((r) => ({ ...r, [c.id]: res }))
      setOutput((o) => (o.trim() ? o : res.output.replace(ANSI, '')))
      if (!res.cancelled) useSwarm.getState().recordCheck(c.label, res.ok)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    cancel.current = null
    setRunning(null)
  }

  const failed = checks?.find((c) => results[c.id] && !results[c.id].ok && !results[c.id].cancelled)
  const banner = useRef<HTMLDivElement>(null)
  // Bring the fix prompt into view when a check fails (the panel sits at the bottom of a scroll area).
  useEffect(() => { if (failed && !running) banner.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [failed, running])
  const askFix = () => {
    if (!failed) return
    const r = results[failed.id]
    useSwarm.getState().prepareFix(buildFixPrompt({ label: failed.label, output: shown === failed.id && output ? output : r.output, originalTask: task, timedOut: r.timed_out }))
  }

  if (error && !checks) return <p className="text-[12px] text-bad">{error}</p>
  if (!checks) return <p className="flex items-center gap-2 text-[12px] text-ink-3"><Loader2 className="h-3.5 w-3.5 animate-spin" />Looking for checks…</p>

  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3"><ShieldCheck className="h-3.5 w-3.5 text-azure-hi" />Verify the result</p>
      {checks.length === 0 ? (
        <p className="mt-1.5 text-[12px] text-ink-3">No tests, build or lint script found in this folder (looked for package.json scripts, Cargo.toml, pytest, and .js files), so there is nothing to run automatically.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {checks.map((c) => {
              const r = results[c.id]
              const busy = running === c.id
              return (
                <button
                  key={c.id} disabled={!!running} onClick={() => run(c)} title={`Runs: ${c.command}`}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] transition-colors disabled:opacity-50',
                    r?.ok ? 'border-ok/40 bg-ok/10 text-ok' : r && !r.cancelled ? 'border-bad/40 bg-bad/10 text-bad' : 'border-line text-ink-2 hover:border-line-hi hover:text-ink',
                  )}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : r?.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : r && !r.cancelled ? <XCircle className="h-3.5 w-3.5" /> : <Play className="h-3 w-3" />}
                  {c.label}
                  {r && !busy && <span className="font-mono text-[10.5px] opacity-70">{formatDurationMs(r.duration_ms)}</span>}
                </button>
              )
            })}
            {running && <Button variant="danger" size="sm" onClick={() => cancel.current?.()}><Square className="h-3 w-3 fill-current" />Stop</Button>}
          </div>
          {/* Only worth mentioning once something has actually failed. */}
          {failed && checks.find((c) => c.note) && <p className="mt-1.5 text-[11.5px] text-warn">{checks.find((c) => c.note)!.note}</p>}
          <p className="mt-1.5 truncate font-mono text-[10.5px] text-ink-4">{checks.map((c) => `${c.label} → ${c.command}`).join('   ·   ')}</p>
        </>
      )}

      {shown && (
        <pre ref={logRef} className="selectable mt-2 max-h-[150px] overflow-auto rounded-xl border hairline bg-night/60 p-2.5 font-mono text-[11px] leading-[1.5] text-ink-2">
          {output || (running ? 'Starting…' : '')}
          {shown && results[shown]?.timed_out && '\n\n⏱ Timed out after 3 minutes and was stopped.'}
          {shown && results[shown]?.cancelled && '\n\n■ Stopped.'}
        </pre>
      )}
      {error && checks && <p className="mt-1.5 text-[12px] text-bad">{error}</p>}

      {failed && !running && (
        <div ref={banner} className="mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad/[0.07] p-2.5">
          <p className="text-[12px] text-ink-2"><span className="font-medium text-bad">{failed.label} failed.</span> The team can read the failure and fix the project.</p>
          <Button variant="primary" size="sm" onClick={askFix}><Wrench className="h-3.5 w-3.5" />Ask the team to fix it</Button>
        </div>
      )}
    </div>
  )
}
