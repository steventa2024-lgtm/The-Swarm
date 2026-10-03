import { motion } from 'framer-motion'
import { FileDiff, FilePlus2, FileText } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { ROLE_META } from '@/lib/meta'
import { useSwarm } from '@/store/swarm'
import type { FileChange } from '@/types'

const ICON = { added: FilePlus2, modified: FileText, deleted: FileText }
const TONE = { added: 'text-ok', modified: 'text-azure-hi', deleted: 'text-bad' }

export function WorkspaceChanges({ files }: { files: FileChange[] }) {
  const finished = useSwarm((s) => ['completed', 'failed', 'stopped'].includes(s.run?.status ?? ''))
  if (files.length === 0) {
    return <EmptyState icon={FileDiff} title="No file changes yet" description="Files touched by workers are listed here live." className="py-6" />
  }
  const add = files.reduce((s, f) => s + f.additions, 0)
  const del = files.reduce((s, f) => s + f.deletions, 0)
  return (
    <div>
      {finished && files.some((f) => f.content !== undefined) && (
        <Button variant="outline" size="sm" className="mb-2 w-full" onClick={() => useSwarm.getState().setApplyOpen(true)}>Review & apply to project</Button>
      )}
      <div className="mb-1.5 flex items-center justify-between px-1.5 text-[11px] text-ink-3">
        <span>{files.length} files</span>
        <span className="font-mono tabular-nums"><span className="text-ok">+{add}</span> <span className="text-bad">−{del}</span></span>
      </div>
      <ul className="space-y-0.5">
        {files.map((f) => {
          const Icon = ICON[f.type]
          const i = f.path.lastIndexOf('/')
          return (
            <motion.li
              key={f.path} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.03]"
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${TONE[f.type]}`} />
              <p className="min-w-0 flex-1 truncate font-mono text-[11px]" title={f.path}>
                <span className="text-ink-4">{i >= 0 ? f.path.slice(0, i + 1) : ''}</span>
                <span className="text-ink">{f.path.slice(i + 1)}</span>
              </p>
              <span className="font-mono text-[10px] tabular-nums"><span className="text-ok">+{f.additions}</span> <span className="text-bad">−{f.deletions}</span></span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ROLE_META[f.role].color }} title={ROLE_META[f.role].label} />
            </motion.li>
          )
        })}
      </ul>
    </div>
  )
}
