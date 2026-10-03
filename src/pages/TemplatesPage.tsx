import { AnimatePresence, motion } from 'framer-motion'
import { Bug, FileText, FlaskConical, Hammer, Layers, Plus, Rocket, Search, Trash2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/fields'
import { MODE_META } from '@/lib/meta'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'
import type { RunMode, Template } from '@/types'

const ICONS: Record<Template['icon'], LucideIcon> = {
  feature: Rocket, bug: Bug, refactor: Hammer, tests: FlaskConical, docs: FileText, research: Search,
}

export function TemplatesPage() {
  const templates = useApp((s) => s.templates)
  const addTemplate = useApp((s) => s.addTemplate)
  const deleteTemplate = useApp((s) => s.deleteTemplate)
  const setPage = useApp((s) => s.setPage)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', prompt: '', mode: 'balanced' as RunMode, agents: 'auto' as Template['agents'] })

  const use = (t: Template) => {
    useSwarm.getState().loadTemplate(t)
    setPage('swarm')
  }
  const save = () => {
    if (!form.name.trim() || !form.prompt.trim()) return
    addTemplate({ ...form, name: form.name.trim(), prompt: form.prompt.trim(), icon: 'feature' })
    setForm({ name: '', description: '', prompt: '', mode: 'balanced', agents: 'auto' })
    setAdding(false)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-[1180px]">
        <PageHeader
          title="Templates"
          description="Reusable task presets with a mode and agent count baked in. Load one and the Swarm screen is ready to run."
          actions={<Button variant="primary" onClick={() => setAdding((a) => !a)}><Plus className="h-4 w-4" />New template</Button>}
        />

        <AnimatePresence>
          {adding && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="glass mb-4 grid grid-cols-2 gap-3 rounded-2xl p-4 max-lg:grid-cols-1">
                <Input placeholder="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input placeholder="Short description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                <Textarea className="col-span-full" rows={3} placeholder="Task prompt" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
                <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as RunMode })}>
                  {(Object.keys(MODE_META) as RunMode[]).map((m) => <option key={m} value={m}>{MODE_META[m].label}</option>)}
                </Select>
                <Select value={String(form.agents)} onChange={(e) => setForm({ ...form, agents: (e.target.value === 'auto' ? 'auto' : Number(e.target.value)) as Template['agents'] })}>
                  <option value="auto">Auto agents</option><option value="2">2 agents</option><option value="3">3 agents</option><option value="4">4 agents</option>
                </Select>
                <div className="col-span-full flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
                  <Button variant="primary" disabled={!form.name.trim() || !form.prompt.trim()} onClick={save}>Save template</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-lg:grid-cols-1">
          <AnimatePresence initial={false}>
            {templates.map((t, i) => {
              const Icon = ICONS[t.icon] ?? Layers
              return (
                <motion.article
                  key={t.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ delay: i * 0.03 }}
                  className="glass glass-hover group flex flex-col rounded-2xl p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-azure/15 text-azure-hi"><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[14px] font-semibold text-ink">{t.name}</h3>
                      <p className="mt-0.5 text-[12px] text-ink-3">{t.description}</p>
                    </div>
                    {!t.builtin && <button onClick={() => deleteTemplate(t.id)} aria-label="Delete template" className="text-ink-4 opacity-0 transition-opacity hover:text-bad group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                  <p className="selectable mt-3 flex-1 rounded-lg border hairline bg-night/50 p-2.5 font-mono text-[11px] leading-relaxed text-ink-2">{t.prompt}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-ink-2">{MODE_META[t.mode].label}</span>
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-ink-2">{t.agents === 'auto' ? 'Auto' : t.agents} agents</span>
                    {t.builtin && <span className="text-[10px] uppercase tracking-wider text-ink-4">Built-in</span>}
                    <Button variant="outline" size="sm" className="ml-auto" onClick={() => use(t)}>Use template</Button>
                  </div>
                </motion.article>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
