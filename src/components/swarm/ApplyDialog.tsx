import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, FolderOpen, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { applyFiles, stageFiles, getStagedProposal, fsAvailable, pickFolder, readText, type ReadResult, type WriteOutcome, type StagedProposal } from '@/lib/fsBridge'
import { collapse, diffLines, type DiffResult } from '@/lib/diff'
import { ROLE_META } from '@/lib/meta'
import { cn } from '@/lib/utils'
import { approvalExpired } from '@/lib/approvalExpiry'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'
import type { FileChange } from '@/types'
import { VerifyPanel } from './VerifyPanel'

interface Proposal { path: string; versions: FileChange[] }
type Existing = { state: 'ok'; read: ReadResult } | { state: 'error'; message: string }

interface Row {
  path: string
  versions: FileChange[]
  change: FileChange
  /** True when several workers proposed this file and the user has not chosen yet. */
  unresolved: boolean
  existing: Existing | undefined
  diff: DiffResult | null
  error?: string
}

const noChange = (r: Row) => !!r.diff && r.diff.additions + r.diff.deletions === 0

function badge(r: Row) {
  if (r.error) return { label: 'Blocked', cls: 'text-bad bg-bad/10' }
  if (!r.existing) return { label: '…', cls: 'text-ink-3 bg-white/5' }
  if (r.unresolved) return { label: 'Pick one', cls: 'text-warn bg-warn/10' }
  if (r.existing.state === 'ok' && !r.existing.read.exists) return { label: 'New', cls: 'text-ok bg-ok/10' }
  if (noChange(r)) return { label: 'Unchanged', cls: 'text-ink-3 bg-white/5' }
  return { label: 'Modified', cls: 'text-azure-hi bg-azure/15' }
}

export function ApplyDialog() {
  const open = useSwarm((s) => s.applyOpen)
  const setOpen = useSwarm((s) => s.setApplyOpen)
  const run = useSwarm((s) => s.run)
  const reviewApprovalId = useSwarm((s) => s.reviewApprovalId)
  const replaying = useSwarm((s) => s.replaying)
  const project = useApp((s) => s.projects.find((p) => p.id === (run?.task.projectId ?? s.activeProjectId)))
  const updateProject = useApp((s) => s.updateProject)
  const [staged, setStaged] = useState<StagedProposal | null>(null)
  const [stageLoading, setStageLoading] = useState(false)
  const root = staged?.root ?? project?.root

  const [existing, setExisting] = useState<Record<string, Existing>>({})
  const [choice, setChoice] = useState<Record<string, string>>({}) // path -> workerId
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [results, setResults] = useState<WriteOutcome[] | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [pendingExpiresAt, setPendingExpiresAt] = useState<number | null>(null)
  const [desktopIntent, setDesktopIntent] = useState(false)
  const [nowMs, setNowMs] = useState(Date.now)
  const [reviewVersion, setReviewVersion] = useState(0)
  const expiresAt = results ? null : pendingExpiresAt ?? staged?.info.expiresAt ?? null
  const expired = approvalExpired(expiresAt, nowMs)

  // Wall-clock checks survive a suspended tab or sleeping desktop. No timer grants authority.
  useEffect(() => {
    if (!open || expiresAt === null) return
    const update = () => setNowMs(Date.now())
    update()
    const timer = window.setInterval(update, 1000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [open, expiresAt])

  useEffect(() => {
    setStaged(null)
    if (!open || !reviewApprovalId) { setStageLoading(false); return }
    let cancelled = false
    setStageLoading(true)
    void getStagedProposal(reviewApprovalId).then((proposal) => {
      if (cancelled) return
      if (proposal.info.runId !== run?.id || proposal.info.projectId !== run.task.projectId) throw new Error('This staged revision belongs to another run or project.')
      setStaged(proposal)
    }).catch((e) => { if (!cancelled) setFatal(String(e)) }).finally(() => { if (!cancelled) setStageLoading(false) })
    return () => { cancelled = true }
  }, [open, reviewApprovalId, run?.id, run?.task.projectId])

  const proposals = useMemo<Proposal[]>(() => {
    const byPath = new Map<string, FileChange[]>()
    const changes = staged ? staged.files.map((f): FileChange => ({ path: f.path, content: f.content, role: 'reviewer', workerId: 'staged-revision', type: f.expected === null ? 'added' : 'modified', additions: f.content.split('\n').length, deletions: 0 })) : run?.fileChanges ?? []
    for (const f of changes) {
      if (f.content === undefined) continue
      byPath.set(f.path, [...(byPath.get(f.path) ?? []), f])
    }
    return [...byPath.entries()].map(([path, versions]) => ({ path, versions }))
  }, [run?.fileChanges, staged])

  // Load current file contents whenever the dialog opens (or the folder changes).
  useEffect(() => {
    if (!open) return
    setResults(null)
    setFatal(null)
    setPending(null)
    setPendingExpiresAt(null)
    setDesktopIntent(false)
    if (staged?.info.status === 'desktop_confirmation_required') { setPending(staged.info.id); setPendingExpiresAt(staged.info.expiresAt); setDesktopIntent(true) }
    setExisting({})
    setChoice({})
    setPicked(new Set())
    setActive(proposals[0]?.path ?? null)
    if (!root) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const next: Record<string, Existing> = {}
      for (const p of proposals) {
        try { next[p.path] = { state: 'ok', read: await readText(root, p.path, 400_000) } }
        catch (e) { next[p.path] = { state: 'error', message: e instanceof Error ? e.message : String(e) } }
      }
      if (cancelled) return
      setExisting(next)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [open, proposals, root, staged, reviewVersion])

  const rows = useMemo<Row[]>(
    () =>
      proposals.map((p) => {
        const chosen = p.versions.find((v) => v.workerId === choice[p.path])
        // Default view for an unresolved conflict is the most complete version; it is not applied until chosen.
        const change = chosen ?? [...p.versions].sort((a, b) => (b.content?.length ?? 0) - (a.content?.length ?? 0))[0]
        const ex = existing[p.path]
        let error: string | undefined
        let diff: DiffResult | null = null
        if (ex?.state === 'error') error = ex.message
        else if (ex?.state === 'ok') {
          if (ex.read.binary) error = 'Existing file is binary'
          else if (ex.read.truncated) error = 'Existing file is too large to diff safely'
          else diff = diffLines(ex.read.content, change.content ?? '')
        }
        return { path: p.path, versions: p.versions, change, unresolved: p.versions.length > 1 && !chosen, existing: ex, diff, error }
      }),
    [proposals, choice, existing],
  )

  // Once files are loaded, pre-select what would change — except unresolved conflicts.
  useEffect(() => {
    if (loading || !open || Object.keys(existing).length === 0) return
    setPicked(new Set(rows.filter((r) => !r.error && !r.unresolved && !noChange(r)).map((r) => r.path)))
    // Only on load; later toggles are the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, open, existing])

  const pick = (path: string, workerId: string) => {
    setChoice((c) => ({ ...c, [path]: workerId }))
    setPicked((s) => new Set(s).add(path))
  }
  const toggle = (p: string) => setPicked((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n })

  const chooseFolder = async () => {
    if (!project) return
    try {
      const folder = await pickFolder()
      if (folder) updateProject(project.id, { root: folder })
    } catch (e) { setFatal(e instanceof Error ? e.message : String(e)) }
  }

  const selected = rows.filter((r) => picked.has(r.path) && !r.error && !r.unresolved)
  const canRequest = run?.source === 'live' && run.status === 'completed' && run.reviewVerdict === 'approved' && !replaying && !stageLoading && !expired && (!reviewApprovalId || !!staged)
  const reviewFreshRevision = () => {
    // Return to the current proposal and reload baselines. Staging and sending still need a new click.
    setPending(null); setPendingExpiresAt(null); setDesktopIntent(false); setStaged(null); setFatal(null)
    setNowMs(Date.now()); setReviewVersion((v) => v + 1); setOpen(true)
  }
  const apply = async (telegram = false) => {
    if (approvalExpired(expiresAt, Date.now())) { setNowMs(Date.now()); setFatal('This approval expired. Review current files before requesting a fresh revision.'); return }
    if (!root || !run || !canRequest) return
    setApplying(true)
    setFatal(null)
    try {
      const approval = staged?.info ?? await stageFiles(root, selected.map((r) => ({ path: r.path, content: r.change.content ?? '', expected: r.existing?.state === 'ok' && r.existing.read.exists ? r.existing.read.content : null })), run.id, run.reviewVerdict === 'approved', run.task.projectId, run.task.id)
      if (telegram) {
        const { invoke } = await import('@tauri-apps/api/core')
        setPending(approval.id)
        setPendingExpiresAt(approval.expiresAt)
        setNowMs(Date.now())
        try {
          if (approvalExpired(approval.expiresAt, Date.now())) throw new Error('This approval expired. Review current files before requesting a fresh revision.')
          const multi = await invoke<{ ownerId: number | null }>('tg_dashboard')
          await invoke(multi.ownerId ? 'tg_request_approval' : 'telegram_request_approval', { approvalId: approval.id })
        }
        catch (error) { setPending(null); setPendingExpiresAt(null); throw error }
      } else setResults(await applyFiles(approval.id))
    }
    catch (e) { setFatal(e instanceof Error ? e.message : String(e)) }
    setApplying(false)
  }

  useEffect(() => {
    if (!pending || !fsAvailable()) return
    let disposed = false; let unlisten: (() => void) | undefined
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const stop = await listen<{ id: string; status: string; outcomes?: WriteOutcome[] }>('swarm-approval', ({ payload }) => {
        if (payload.id === pending) {
          if (payload.status === 'desktop_confirmation_required') { setDesktopIntent(true); setFatal(null); return }
          setPending(null)
          setPendingExpiresAt(null)
          setDesktopIntent(false)
          if (payload.outcomes?.length) { setResults(payload.outcomes); setFatal(null) }
          else setFatal(`Zero's Telegram decision: ${payload.status}. Reopen review to compare the current files.`)
        }
      }); if (disposed) stop(); else unlisten = stop
    })
    return () => { disposed = true; unlisten?.() }
  }, [pending])

  const current = rows.find((r) => r.path === active)
  const view = current?.diff ? collapse(current.diff.ops) : []

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-void/75 p-6 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            className="glass selectable flex h-[min(720px,88vh)] w-full max-w-[1080px] flex-col rounded-3xl shadow-glow" role="dialog" aria-modal aria-label="Review and apply changes"
          >
            <header className="flex items-center gap-3 border-b hairline px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold text-ink">Review & apply changes</h3>
                <p className="truncate font-mono text-[11px] text-ink-3">
                  {root ? <>→ {root}</> : 'No project folder chosen — workers can only write inside a folder you approve'}
                </p>
              </div>
              {fsAvailable() && !reviewApprovalId && <Button variant="outline" size="sm" disabled={!!pending} onClick={chooseFolder}><FolderOpen className="h-3.5 w-3.5" />{root ? 'Change folder' : 'Choose folder'}</Button>}
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></Button>
            </header>

            {!fsAvailable() ? (
              <Empty text="Writing files needs the desktop app. In the browser preview you can still review the proposals." />
            ) : proposals.length === 0 ? (
              <Empty text="This run produced no file proposals." />
            ) : !root ? (
              <Empty text="Choose the project folder to compare these proposals against your files." action={<Button variant="primary" onClick={chooseFolder}><FolderOpen className="h-4 w-4" />Choose folder</Button>} />
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr]">
                <ul className="min-h-0 space-y-1 overflow-y-auto border-r hairline p-2.5">
                  {rows.map((r) => {
                    const b = badge(r)
                    return (
                      <li key={r.path}>
                        <div
                          onClick={() => setActive(r.path)}
                          className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors', active === r.path ? 'border-azure-hi/50 bg-azure/10' : 'border-transparent hover:bg-white/[0.04]')}
                        >
                          <input type="checkbox" className="accent-[#3b82ff]" disabled={!!staged || !!pending || !!r.error || r.unresolved || !r.existing} checked={picked.has(r.path) && !r.unresolved} onClick={(e) => e.stopPropagation()} onChange={() => toggle(r.path)} aria-label={`Apply ${r.path}`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-[11.5px] text-ink" title={r.path}>{r.path}</p>
                            <p className="flex items-center gap-1.5 text-[10px]" style={{ color: ROLE_META[r.change.role].color }}>
                              {r.unresolved ? `${r.versions.length} versions` : ROLE_META[r.change.role].short}
                              {r.versions.length > 1 && <AlertTriangle className="h-2.5 w-2.5 text-warn" />}
                            </p>
                          </div>
                          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', b.cls)}>{b.label}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>

                <div className="flex min-h-0 flex-col bg-night/40">
                  {current && current.versions.length > 1 && (
                    <div className="flex flex-wrap items-center gap-2 border-b hairline px-3 py-2 font-sans text-[11.5px]">
                      <span className="flex items-center gap-1 text-warn"><AlertTriangle className="h-3 w-3" />Several workers proposed this file — choose which version to use:</span>
                      {current.versions.map((v) => (
                        <button
                          key={v.workerId} disabled={!!pending || !!staged} onClick={() => pick(current.path, v.workerId)}
                          className={cn('rounded-md border px-2 py-0.5 transition-colors', choice[current.path] === v.workerId ? 'border-azure-hi/60 bg-azure/25 text-white' : 'border-line text-ink-2 hover:border-line-hi')}
                        >
                          {ROLE_META[v.role].short} · {v.additions} lines
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11.5px] leading-[1.55]">
                    {loading && <p className="flex items-center gap-2 text-ink-3"><Loader2 className="h-3.5 w-3.5 animate-spin" />Comparing with your files…</p>}
                    {current?.error && <p className="mb-2 text-bad">{current.error}</p>}
                    {current?.existing?.state === 'ok' && !current.existing.read.exists && <p className="mb-2 text-ok">New file · {current.change.additions} lines</p>}
                    {current?.diff?.coarse && <p className="mb-2 text-warn">Large change — shown as a full rewrite.</p>}
                    {view.map((o, i) =>
                      o.type === 'gap' ? (
                        <div key={i} className="my-1 select-none text-center text-[10.5px] text-ink-4">⋯ {o.hidden} unchanged lines ⋯</div>
                      ) : (
                        <div key={i} className={cn('flex whitespace-pre-wrap break-all px-1.5', o.type === 'add' && 'bg-ok/10 text-ok', o.type === 'del' && 'bg-bad/10 text-bad', o.type === 'ctx' && 'text-ink-3')}>
                          <span className="w-4 shrink-0 select-none opacity-70">{o.type === 'add' ? '+' : o.type === 'del' ? '−' : ' '}</span>
                          <span>{o.text || ' '}</span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>
            )}

            {staged && <p className="border-t hairline px-5 py-2 text-xs text-ink-2">Immutable staged revision {staged.info.id} · project {staged.info.projectId} · {staged.info.risk} risk</p>}
            {(!canRequest || pending) && <p role="status" className="border-t hairline px-5 py-2 text-xs text-warn">{stageLoading ? 'Loading exact staged revision…' : expired ? `Approval expired · revision ${pending ?? staged?.info.id}. Review current files before requesting a fresh revision. Nothing will be resent automatically.` : pending ? `${desktopIntent ? 'Telegram intent recorded · desktop confirmation required' : 'Awaiting Zero on Telegram'} · revision ${pending}${expiresAt !== null ? ` · expires ${new Date(expiresAt * 1000).toLocaleTimeString()}` : ''}` : 'Apply requires a completed live run, passed review, and Zero’s native approval. Replay and simulation are read-only.'}</p>}
            {(fatal || results) && (
              <div className="max-h-[48%] overflow-y-auto border-t hairline px-5 py-3 text-[12px]">
                {fatal && <p className="text-bad">{fatal}</p>}
                {results && (
                  <ul className="space-y-0.5">
                    {results.map((r) => (
                      <li key={r.path} className={cn('flex items-center gap-1.5 font-mono', r.ok ? 'text-ok' : 'text-bad')}>
                        {r.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                        {r.ok ? (r.created ? 'Created' : 'Updated') : 'Failed'} {r.path}{r.error ? ` — ${r.error}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
                {results?.some((r) => r.ok) && root && (
                  <div className="mt-3 border-t hairline pt-3">
                    <VerifyPanel root={root} task={run?.task.prompt} />
                  </div>
                )}
              </div>
            )}

            <footer className="flex items-center justify-between gap-3 border-t hairline px-5 py-3">
              <p className="text-[11.5px] text-ink-3">
                {results
                  ? `${results.filter((r) => r.ok).length} of ${results.length} written. Verify below, and review the changes with git before committing.`
                  : `${selected.length} of ${rows.length} selected${rows.some((r) => r.unresolved) ? ' · conflicts need a version chosen' : ''}. Nothing is written until you apply.`}
              </p>
              <div className="flex gap-2">
                {(expired || (!!reviewApprovalId && !stageLoading && !staged && !!fatal)) && <Button variant="outline" disabled={applying || stageLoading} onClick={reviewFreshRevision}>Review a fresh revision</Button>}
                {desktopIntent && pending && <Button variant="primary" disabled={applying || expired} onClick={async () => { if (approvalExpired(expiresAt, Date.now())) { setNowMs(Date.now()); setFatal('This approval expired. Review current files before requesting a fresh revision.'); return } setApplying(true); setFatal(null); try { setResults(await applyFiles(pending)); setPending(null); setPendingExpiresAt(null); setDesktopIntent(false) } catch (e) { setFatal(String(e)) } finally { setApplying(false) } }}>Confirm staged revision on desktop</Button>}
                <Button variant="ghost" onClick={() => setOpen(false)}>{results ? 'Done' : 'Cancel'}</Button>
                {!results && (
                  <><Button variant="outline" disabled={!canRequest || !root || !selected.length || applying || loading || !!pending} onClick={() => void apply(true)}>Ask via Telegram</Button>
                  <Button variant="primary" disabled={!canRequest || !root || selected.length === 0 || applying || loading || !!pending} onClick={() => void apply()}>
                    {applying && <Loader2 className="h-4 w-4 animate-spin" />}Zero: approve & apply {selected.length}
                  </Button></>
                )}
              </div>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <p className="max-w-sm text-[13px] text-ink-3">{text}</p>
      {action}
    </div>
  )
}
