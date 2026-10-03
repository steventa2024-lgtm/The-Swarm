import { Clock, FolderGit2, GanttChart, MonitorPlay, Network } from 'lucide-react'
import { RUN_STATUS_META } from '@/lib/meta'
import { formatDuration } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'
import { StatusBadge } from '@/components/common/StatusBadge'
import { previewableFiles } from '@/components/swarm/PreviewPane'
import { looksPreviewable } from '@/preview/build'
import { RunControlBar } from '@/components/swarm/RunControlBar'
import { Select } from '@/components/ui/fields'
import { Segmented } from '@/components/ui/segmented'
import type { PageId } from '@/types'

const TITLES: Record<PageId, string> = {
  swarm: 'Swarm',
  projects: 'Projects',
  agents: 'Agents',
  knowledge: 'Knowledge',
  templates: 'Templates',
  integrations: 'Integrations',
  settings: 'Settings',
  support: 'Support',
}

export function TopBar() {
  const page = useApp((s) => s.page)
  const projects = useApp((s) => s.projects)
  const activeId = useApp((s) => s.activeProjectId)
  const setActive = useApp((s) => s.setActiveProject)
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const run = useSwarm((s) => s.run)

  // A dot on the Preview tab when the run has produced something that can be shown.
  const previewReady = view !== 'preview' && looksPreviewable(previewableFiles(run).map((f) => f.path))
  const status = run?.status ?? 'idle'
  const meta = RUN_STATUS_META[status]
  const project = projects.find((p) => p.id === (run?.task.projectId ?? activeId))

  return (
    <header className="relative z-10 flex h-[60px] shrink-0 items-center gap-4 border-b hairline px-5">
      <div className="flex min-w-0 items-center gap-3">
        <FolderGit2 className="h-4 w-4 shrink-0 text-azure-hi" />
        <div className="w-[190px] shrink-0">
          <Select value={activeId} onChange={(e) => setActive(e.target.value)} className="h-8 text-xs" aria-label="Project">
            {projects.filter((p) => p.status !== 'archived').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      </div>

      <div className="h-6 w-px bg-line" />

      <div className="min-w-0 flex-1">
        {page === 'swarm' ? (
          <>
            <div className="truncate text-[14px] font-semibold text-ink">{run ? run.task.title : 'No active run'}</div>
            <div className="truncate text-[11.5px] text-ink-3">
              {run
                ? `${project?.name ?? 'project'} · ${run.workers.length - 2} workers · ${run.task.complexity} complexity`
                : 'Describe a task below to assemble a swarm'}
            </div>
          </>
        ) : (
          <>
            <div className="text-[14px] font-semibold text-ink">{TITLES[page]}</div>
            <div className="truncate text-[11.5px] text-ink-3">{project?.name} · {project?.branch}</div>
          </>
        )}
      </div>

      {page === 'swarm' && (
        <div className="flex shrink-0 items-center gap-3">
          <StatusBadge tone={meta.tone} label={meta.label} live={meta.live} />
          <div className="flex items-center gap-1.5 font-mono text-[13px] tabular-nums text-ink-2">
            <Clock className="h-3.5 w-3.5 text-ink-3" />
            {formatDuration(run?.elapsedMs ?? 0)}
          </div>
          <RunControlBar />
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'graph', title: 'Graph view', label: <span className="flex items-center gap-1.5"><Network className="h-3.5 w-3.5" />Graph</span> },
              { value: 'timeline', title: 'Timeline view', label: <span className="flex items-center gap-1.5"><GanttChart className="h-3.5 w-3.5" />Timeline</span> },
              { value: 'preview', title: 'Live preview of what the agents built', label: <span className="relative flex items-center gap-1.5"><MonitorPlay className="h-3.5 w-3.5" />Preview{previewReady && <span className="absolute -right-2 -top-1 h-1.5 w-1.5 animate-pulse-dot rounded-full bg-ok text-ok" />}</span> },
            ]}
          />
        </div>
      )}
    </header>
  )
}
