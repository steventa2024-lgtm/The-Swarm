import { History, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { StatusBadge } from '@/components/common/StatusBadge'
import { Tip } from '@/components/ui/tooltip'
import { RUN_STATUS_META } from '@/lib/meta'
import { cn, timeAgo } from '@/lib/utils'
import { deleteRun, listRuns, loadRun, type StoredRunMeta } from '@/persistence/runStore'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'

/** Reopen a finished run: see its graph, preview what it built, apply or verify it again. */
export function RunHistoryMenu() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<StoredRunMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const status = useSwarm((s) => s.run?.status)
  const currentId = useSwarm((s) => s.run?.id)
  const projects = useApp((s) => s.projects)
  const storing = useApp((s) => s.preferences.storeRunLogs)
  const busy = !!status && ['planning', 'running', 'reviewing', 'paused'].includes(status)

  useEffect(() => {
    if (!open) return
    setError(null)
    listRuns().then(setItems).catch(() => setItems([]))
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc) }
  }, [open])

  const openItem = async (m: StoredRunMeta) => {
    const run = await loadRun(m.id)
    if (!run) { setError('That run could not be read. It may have been removed.'); return }
    if (useSwarm.getState().openRun(run)) setOpen(false)
  }
  const remove = async (id: string) => {
    await deleteRun(id)
    setItems((list) => (list ?? []).filter((m) => m.id !== id))
  }

  return (
    <div ref={box} className="relative">
      <Tip label={busy ? 'Finish or stop the current run to open a past one' : 'Past runs'}>
        <button
          onClick={() => !busy && setOpen((o) => !o)} aria-label="Past runs" aria-expanded={open} disabled={busy}
          className={cn('flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors disabled:opacity-40',
            open ? 'border-azure-hi/50 bg-azure/15 text-white' : 'border-line text-ink-2 hover:border-line-hi hover:text-ink')}
        >
          <History className="h-3.5 w-3.5" /><span className="max-xl:hidden">History</span>
        </button>
      </Tip>

      {open && (
        <div className="glass absolute right-0 top-full z-40 mt-2 w-[380px] rounded-2xl p-2 shadow-glow" role="menu">
          <p className="px-2.5 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-3">Saved runs</p>
          {items === null ? (
            <p className="px-2.5 py-4 text-[12px] text-ink-3">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-2.5 py-4 text-[12px] leading-relaxed text-ink-3">
              {storing ? 'No saved runs yet. Each finished live run is saved here, with the files it produced.' : 'Saving runs is turned off (Settings → Data & privacy).'}
            </p>
          ) : (
            <ul className="max-h-[360px] space-y-0.5 overflow-y-auto">
              {items.map((m) => {
                const meta = RUN_STATUS_META[m.status]
                return (
                  <li key={m.id} className="group">
                    <div
                      onClick={() => openItem(m)} role="menuitem" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openItem(m)}
                      className={cn('flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 transition-colors hover:bg-white/[0.05]', currentId === m.id && 'bg-azure/10')}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-ink">{m.title}</p>
                        <p className="truncate text-[10.5px] text-ink-3">
                          {projects.find((p) => p.id === m.projectId)?.name ?? 'project'} · {timeAgo(m.startedAt)} · {m.files} file{m.files === 1 ? '' : 's'}{m.trimmed ? ' (large files not kept)' : ''}
                        </p>
                      </div>
                      <StatusBadge tone={meta.tone} label={meta.label} />
                      <button
                        onClick={(e) => { e.stopPropagation(); void remove(m.id) }} aria-label={`Delete ${m.title}`}
                        className="text-ink-4 opacity-0 transition-opacity hover:text-bad group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {error && <p className="px-2.5 pb-1 pt-2 text-[11.5px] text-bad">{error}</p>}
        </div>
      )}
    </div>
  )
}
