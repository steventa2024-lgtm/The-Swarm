import { motion } from 'framer-motion'
import { FolderGit2, FolderOpen, GitBranch, Play } from 'lucide-react'
import { useState } from 'react'
import { PageHeader, SectionTitle } from '@/components/common/PageHeader'
import { StatusBadge } from '@/components/common/StatusBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { MODE_META, RUN_STATUS_META } from '@/lib/meta'
import { cn, formatCost, formatDuration, formatTokens, timeAgo } from '@/lib/utils'
import { fsAvailable, pickFolder } from '@/lib/fsBridge'
import { useApp } from '@/store/app'
import type { Project } from '@/types'

const STATUS: Record<Project['status'], { label: string; tone: 'success' | 'warning' | 'muted' }> = {
  healthy: { label: 'Healthy', tone: 'success' },
  attention: { label: 'Needs attention', tone: 'warning' },
  archived: { label: 'Archived', tone: 'muted' },
}

export function ProjectsPage() {
  const projects = useApp((s) => s.projects)
  const history = useApp((s) => s.history)
  const memory = useApp((s) => s.memory)
  const setActive = useApp((s) => s.setActiveProject)
  const setPage = useApp((s) => s.setPage)
  const activeId = useApp((s) => s.activeProjectId)
  const updateProject = useApp((s) => s.updateProject)
  const [selectedId, setSelected] = useState(activeId)
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0]
  const runs = history.filter((h) => h.projectId === selected?.id).slice(0, 6)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-[1180px]">
        <PageHeader title="Projects" description="Repositories and folders your swarm can work in. Workers only touch paths you approve." />
        <div className="grid grid-cols-[1fr_360px] gap-5 max-xl:grid-cols-1">
          <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
            {projects.map((p, i) => (
              <motion.button
                key={p.id} onClick={() => setSelected(p.id)}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className={cn('glass glass-hover rounded-2xl p-4 text-left', selected?.id === p.id && 'glass-active')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-azure/15 text-azure-hi"><FolderGit2 className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-ink">{p.name}</p>
                      <p className="truncate font-mono text-[11px] text-ink-3">{p.path}</p>
                    </div>
                  </div>
                  <StatusBadge tone={STATUS[p.status].tone} label={STATUS[p.status].label} />
                </div>
                <p className="mt-3 line-clamp-2 text-[12px] text-ink-2">{p.description}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.stack.map((s) => <span key={s} className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] text-ink-2">{s}</span>)}
                </div>
                <div className="mt-3 flex items-center gap-3 border-t hairline pt-2.5 text-[11px] text-ink-3">
                  <span className="flex items-center gap-1 font-mono"><GitBranch className="h-3 w-3" />{p.branch}</span>
                  <span className="ml-auto">{p.runCount} runs</span>
                  <span>{p.lastRunAt ? timeAgo(p.lastRunAt) : 'never run'}</span>
                </div>
              </motion.button>
            ))}
          </div>

          {selected && (
            <aside className="glass h-fit rounded-2xl p-5 max-xl:order-first">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-ink">{selected.name}</h2>
                <StatusBadge tone={STATUS[selected.status].tone} label={STATUS[selected.status].label} />
              </div>
              <p className="mt-1 text-[12px] text-ink-3">{selected.description}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[['Runs', selected.runCount], ['Memory', memory.filter((m) => m.projectId === selected.id).length], ['Branch', selected.branch]].map(([k, v]) => (
                  <div key={k} className="min-w-0 rounded-xl border hairline bg-white/[0.03] p-2">
                    <p className="truncate font-mono text-[13px] font-semibold text-ink">{v}</p>
                    <p className="text-[10px] uppercase tracking-wider text-ink-3">{k}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl border hairline bg-white/[0.03] p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">Working folder</p>
                <p className="mt-0.5 break-all font-mono text-[11px] text-ink-2">{selected.root ?? 'Not set — workers cannot read or write files'}</p>
                {fsAvailable() ? (
                  <Button variant="outline" size="sm" className="mt-2" onClick={async () => { const f = await pickFolder().catch(() => null); if (f) updateProject(selected.id, { root: f }) }}>
                    <FolderOpen className="h-3.5 w-3.5" />{selected.root ? 'Change folder' : 'Choose folder'}
                  </Button>
                ) : <p className="mt-1 text-[11px] text-ink-4">Choosing a folder needs the desktop app.</p>}
              </div>
              <Button
                variant="primary" className="mt-4 w-full" disabled={selected.status === 'archived'}
                onClick={() => { setActive(selected.id); setPage('swarm') }}
              >
                <Play className="h-3.5 w-3.5" />Open in Swarm
              </Button>

              <div className="mt-5">
                <SectionTitle>Recent runs</SectionTitle>
                {runs.length === 0 ? (
                  <EmptyState icon={Play} title="No runs yet" description="Runs for this project will appear here." className="py-6" />
                ) : (
                  <ul className="space-y-1.5">
                    {runs.map((r) => (
                      <li key={r.id} className="rounded-xl border hairline bg-white/[0.02] p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[12.5px] font-medium text-ink">{r.title}</p>
                          <StatusBadge tone={RUN_STATUS_META[r.status].tone} label={RUN_STATUS_META[r.status].label} />
                        </div>
                        <p className="mt-1 font-mono text-[10.5px] text-ink-3">
                          {MODE_META[r.mode].label} · {r.agentCount} workers · {formatDuration(r.durationMs)} · {formatTokens(r.tokens)} tok · {formatCost(r.costUsd)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
