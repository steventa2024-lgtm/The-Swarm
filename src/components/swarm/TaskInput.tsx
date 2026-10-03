import { CornerDownLeft, Paperclip, Rocket, X } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'
import { MODE_META } from '@/lib/meta'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'
import { Button } from '@/components/ui/button'
import { Select, Textarea } from '@/components/ui/fields'
import { Segmented } from '@/components/ui/segmented'
import type { RunMode } from '@/types'

export function TaskInput() {
  const prompt = useSwarm((s) => s.prompt)
  const mode = useSwarm((s) => s.mode)
  const agentCount = useSwarm((s) => s.agentCount)
  const attachments = useSwarm((s) => s.attachments)
  const { setPrompt, setMode, setAgentCount, addAttachment, removeAttachment, start } = useSwarm.getState()
  const templates = useApp((s) => s.templates)
  const fileRef = useRef<HTMLInputElement>(null)

  const submit = () => start()
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="glass rounded-2xl p-3">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKey}
            rows={2}
            placeholder="Describe a task for the swarm — e.g. “Refactor this API layer behind a service interface”"
            className="min-h-[58px] text-[13.5px]"
            aria-label="Task prompt"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {attachments.map((a) => (
              <span key={a} className="inline-flex items-center gap-1 rounded-md border border-line bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2">
                {a}
                <button onClick={() => removeAttachment(a)} aria-label={`Remove ${a}`} className="text-ink-4 hover:text-ink"><X className="h-3 w-3" /></button>
              </span>
            ))}
            {!prompt && attachments.length === 0 && (
              <>
                <span className="text-[11px] text-ink-4">Try</span>
                {templates.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => useSwarm.getState().loadTemplate(t)}
                    className="rounded-md border border-line px-2 py-0.5 text-[11px] text-ink-3 transition-colors hover:border-line-hi hover:bg-azure/10 hover:text-ink"
                  >
                    {t.name}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="flex w-[300px] shrink-0 flex-col justify-between gap-2 max-lg:w-[220px]">
          <div className="flex items-center gap-2">
            <span className="w-12 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Agents</span>
            <Segmented
              size="sm"
              value={agentCount}
              onChange={setAgentCount}
              options={[
                { value: 'auto', label: 'Auto' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4' },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-12 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Mode</span>
            <Select value={mode} onChange={(e) => setMode(e.target.value as RunMode)} className="h-8 flex-1 text-xs" aria-label="Run mode">
              {(Object.keys(MODE_META) as RunMode[]).map((m) => (
                <option key={m} value={m}>{MODE_META[m].label} — {MODE_META[m].hint}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                Array.from(e.target.files ?? []).forEach((f) => addAttachment(f.name))
                e.target.value = ''
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} title="Attach context files">
              <Paperclip className="h-3.5 w-3.5" />Context
            </Button>
            <Button variant="primary" size="md" className="flex-1" disabled={!prompt.trim()} onClick={submit}>
              <Rocket className="h-4 w-4" />Run swarm
              <span className="ml-1 hidden items-center gap-0.5 rounded bg-white/15 px-1 text-[10px] font-normal opacity-80 xl:inline-flex">
                Ctrl<CornerDownLeft className="h-2.5 w-2.5" />
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
