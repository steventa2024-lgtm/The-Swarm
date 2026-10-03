import { BookOpen, ClipboardCopy, Keyboard, MessageSquareHeart, ScrollText, Stethoscope } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/fields'
import { formatDuration } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'

const VERSION = '0.1.0'

function Card({ icon: Icon, title, children }: { icon: typeof BookOpen; title: string; children: ReactNode }) {
  return (
    <section className="glass rounded-2xl p-5">
      <h2 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-ink"><Icon className="h-4 w-4 text-azure-hi" />{title}</h2>
      {children}
    </section>
  )
}

export function SupportPage() {
  const providers = useApp((s) => s.providers)
  const history = useApp((s) => s.history)
  const agents = useApp((s) => s.agents)
  const orchestrator = useApp((s) => s.preferences.orchestrator)
  const run = useSwarm((s) => s.run)
  const [feedback, setFeedback] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  const diag: [string, string][] = [
    ['App version', VERSION],
    ['Runtime', inTauri ? 'Tauri desktop' : 'Browser preview'],
    ['Storage', inTauri ? 'SQLite (kv_store)' : 'localStorage'],
    ['Orchestrator', orchestrator === 'live' ? 'Live (provider calls)' : 'Simulated driver'],
    ['Providers online', `${providers.filter((p) => p.status === 'connected').length} / ${providers.length}`],
    ['Agents enabled', `${agents.filter((a) => a.enabled).length} / ${agents.length}`],
    ['Runs in history', String(history.length)],
  ]

  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1600) } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-[1000px]">
        <PageHeader title="Support" description={`ZeroPulse Swarm v${VERSION}`} />
        <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
          <Card icon={BookOpen} title="Documentation">
            <ul className="space-y-2 text-[12.5px] text-ink-2">
              <li><span className="text-ink">Getting started</span> — submit a task, watch the planner split it, review the merge.</li>
              <li><span className="text-ink">Run modes</span> — Eco, Balanced, Max Quality, Local Only and Fastest change which model each role uses.</li>
              <li><span className="text-ink">Providers</span> — add OpenAI-compatible, Anthropic, OpenRouter, Ollama or llama.cpp endpoints in Settings.</li>
              <li><span className="text-ink">Project memory</span> — notes and decisions in Knowledge are given to workers as context.</li>
            </ul>
          </Card>

          <Card icon={Keyboard} title="Shortcuts">
            <ul className="space-y-2 text-[12.5px]">
              {[['Ctrl + Enter', 'Run the swarm from the task box'], ['Esc', 'Close the final output dialog']].map(([k, v]) => (
                <li key={k} className="flex items-center justify-between"><span className="text-ink-2">{v}</span><kbd className="rounded-md border border-line bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] text-ink">{k}</kbd></li>
              ))}
            </ul>
          </Card>

          <Card icon={Stethoscope} title="Diagnostics">
            <dl className="space-y-1.5 text-[12.5px]">
              {diag.map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-ink-3">{k}</dt><dd className="font-mono text-ink">{v}</dd></div>)}
            </dl>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => copy('diag', diag.map(([k, v]) => `${k}: ${v}`).join('\n'))}>
              <ClipboardCopy className="h-3.5 w-3.5" />{copied === 'diag' ? 'Copied' : 'Copy report'}
            </Button>
          </Card>

          <Card icon={ScrollText} title="Current run log">
            {run && run.events.length > 0 ? (
              <ul className="selectable max-h-[200px] space-y-1 overflow-y-auto font-mono text-[11px] text-ink-2">
                {run.events.slice(0, 30).map((e) => <li key={e.id}><span className="text-ink-4">[{formatDuration(e.at)}]</span> {e.message}</li>)}
              </ul>
            ) : <p className="text-[12.5px] text-ink-3">No run in progress. Logs appear here during a run.</p>}
          </Card>

          <div className="col-span-full">
            <Card icon={MessageSquareHeart} title="Feedback">
              <Textarea rows={3} placeholder="What's working, what isn't?" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[11.5px] text-ink-3">In-app submission isn't connected yet — copy your note and send it to your team.</p>
                <Button variant="primary" size="sm" disabled={!feedback.trim()} onClick={() => copy('fb', feedback)}>{copied === 'fb' ? 'Copied' : 'Copy feedback'}</Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
