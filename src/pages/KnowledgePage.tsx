import { AnimatePresence, motion } from 'framer-motion'
import { BookMarked, FileText, GitCommitHorizontal, Lightbulb, Plus, Search, StickyNote, Trash2, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/fields'
import { Segmented } from '@/components/ui/segmented'
import { timeAgo } from '@/lib/utils'
import { useApp } from '@/store/app'
import type { MemoryKind } from '@/types'

const KINDS: Record<MemoryKind, { label: string; icon: LucideIcon; color: string }> = {
  note: { label: 'Note', icon: StickyNote, color: '#7dd3fc' },
  decision: { label: 'Decision', icon: GitCommitHorizontal, color: '#4d9bff' },
  doc: { label: 'Indexed doc', icon: FileText, color: '#22d3ee' },
  'repo-summary': { label: 'Repo summary', icon: Lightbulb, color: '#8aa4ff' },
}

export function KnowledgePage() {
  const memory = useApp((s) => s.memory)
  const projects = useApp((s) => s.projects)
  const activeId = useApp((s) => s.activeProjectId)
  const addMemory = useApp((s) => s.addMemory)
  const deleteMemory = useApp((s) => s.deleteMemory)
  const [scope, setScope] = useState<'project' | 'all'>('project')
  const [kind, setKind] = useState<MemoryKind | 'all'>('all')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', kind: 'note' as MemoryKind, tags: '' })

  const list = useMemo(
    () =>
      memory
        .filter((m) => (scope === 'all' || m.projectId === activeId) && (kind === 'all' || m.kind === kind))
        .filter((m) => !q || `${m.title} ${m.body} ${m.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [memory, scope, kind, q, activeId],
  )
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id
  const totalUses = memory.filter((m) => scope === 'all' || m.projectId === activeId).reduce((s, m) => s + m.uses, 0)

  const save = () => {
    if (!form.title.trim() || !form.body.trim()) return
    addMemory({
      projectId: activeId, kind: form.kind, title: form.title.trim(), body: form.body.trim(),
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    })
    setForm({ title: '', body: '', kind: 'note', tags: '' })
    setAdding(false)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-[1180px]">
        <PageHeader
          title="Knowledge"
          description={`Project memory the swarm reads before every run. ${totalUses} context pulls so far.`}
          actions={<Button variant="primary" onClick={() => setAdding((a) => !a)}><Plus className="h-4 w-4" />Add entry</Button>}
        />

        <AnimatePresence>
          {adding && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="glass mb-4 grid grid-cols-[1fr_180px] gap-3 rounded-2xl p-4 max-lg:grid-cols-1">
                <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as MemoryKind })}>
                  {(Object.keys(KINDS) as MemoryKind[]).map((k) => <option key={k} value={k}>{KINDS[k].label}</option>)}
                </Select>
                <Textarea className="col-span-full" rows={3} placeholder="What should the swarm remember?" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
                <Input className="col-span-full" placeholder="Tags, comma separated" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
                <div className="col-span-full flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
                  <Button variant="primary" onClick={save} disabled={!form.title.trim() || !form.body.trim()}>Save to {projectName(activeId)}</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
            <Input className="pl-9" placeholder="Search memory" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Segmented size="sm" value={scope} onChange={setScope} options={[{ value: 'project', label: projectName(activeId) }, { value: 'all', label: 'All projects' }]} />
          <Segmented size="sm" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, ...(Object.keys(KINDS) as MemoryKind[]).map((k) => ({ value: k, label: KINDS[k].label }))]} />
        </div>

        {list.length === 0 ? (
          <div className="glass rounded-2xl"><EmptyState icon={BookMarked} title="Nothing here yet" description="Add notes, decisions and summaries so workers stop re-learning your project." /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
            <AnimatePresence initial={false}>
              {list.map((m) => {
                const k = KINDS[m.kind]
                const Icon = k.icon
                return (
                  <motion.article
                    key={m.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                    className="glass glass-hover selectable group rounded-2xl p-4"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${k.color}1f`, color: k.color }}><Icon className="h-3.5 w-3.5" /></span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[13.5px] font-semibold text-ink">{m.title}</h3>
                        <p className="text-[10.5px] text-ink-4">{k.label} · {scope === 'all' && `${projectName(m.projectId)} · `}{timeAgo(m.updatedAt)} · used {m.uses}×</p>
                      </div>
                      <button onClick={() => deleteMemory(m.id)} aria-label="Delete entry" className="text-ink-4 opacity-0 transition-opacity hover:text-bad group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <p className="mt-2.5 text-[12px] leading-relaxed text-ink-2">{m.body}</p>
                    {m.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{m.tags.map((t) => <span key={t} className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-ink-3">#{t}</span>)}</div>}
                  </motion.article>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
