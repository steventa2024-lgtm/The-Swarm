import { AlertTriangle, Code2, Loader2, MonitorPlay, Monitor, RefreshCw, Smartphone, Tablet } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState } from '@/components/common/EmptyState'
import { Segmented } from '@/components/ui/segmented'
import { ROLE_META } from '@/lib/meta'
import { cn } from '@/lib/utils'
import { inTauri } from '@/providers/transport'
import { buildBundle, signature, toSrcdoc, type PreviewFile } from '@/preview/build'
import type { AgentRole, Run } from '@/types'

const DEVICES = {
  desktop: { w: '100%', icon: Monitor, label: 'Desktop' },
  tablet: { w: '768px', icon: Tablet, label: 'Tablet' },
  mobile: { w: '390px', icon: Smartphone, label: 'Phone' },
} as const
type Device = keyof typeof DEVICES

// When several agents propose the same path, prefer the one whose job it is to build UI.
const PREFER: AgentRole[] = ['frontend', 'backend', 'qa', 'docs', 'researcher']

/** Files that are safe to show: from agents that finished (or the whole run once it's done). */
export function previewableFiles(run: Run | null): { path: string; content: string; role: AgentRole }[] {
  if (!run) return []
  const done = new Set(run.workers.filter((w) => w.status === 'done').map((w) => w.id))
  const best = new Map<string, { path: string; content: string; role: AgentRole }>()
  for (const f of run.fileChanges) {
    if (f.content === undefined) continue
    if (run.status !== 'completed' && !done.has(f.workerId)) continue
    const cur = best.get(f.path)
    if (!cur || PREFER.indexOf(f.role) < PREFER.indexOf(cur.role)) best.set(f.path, { path: f.path, content: f.content, role: f.role })
  }
  return [...best.values()]
}

export function PreviewPane({ run }: { run: Run | null }) {
  const [tab, setTab] = useState<'preview' | 'code'>('preview')
  const [device, setDevice] = useState<Device>('desktop')
  const [src, setSrc] = useState<string | null>(null)
  const [srcdoc, setSrcdoc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [codePath, setCodePath] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const token = useRef<string | undefined>(undefined)
  const frame = useRef<HTMLIFrameElement>(null)

  const files = useMemo(() => previewableFiles(run), [run])
  const plain: PreviewFile[] = useMemo(() => files.map((f) => ({ path: f.path, content: f.content })), [files])
  // The run object updates several times a second; only rebuild when file contents really change.
  const rawSig = signature(plain)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bundle = useMemo(() => buildBundle(plain), [rawSig])
  const sig = useMemo(() => signature(bundle.files), [bundle])

  // Publish to the preview server (desktop) or build a srcdoc (browser dev).
  useEffect(() => {
    setError(null)
    setPublishError(null)
    if (bundle.kind === 'none') { setSrc(null); setSrcdoc(null); return }
    if (!inTauri()) { setSrc(null); setSrcdoc(toSrcdoc(bundle)); return }
    let cancelled = false
    const t = window.setTimeout(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const res = await invoke<{ token: string; base: string }>('preview_publish', { files: bundle.files, token: token.current })
        if (cancelled) return
        token.current = res.token
        setSrc(`${res.base}${bundle.entry}?v=${Date.now()}`)
      } catch (e) {
        if (!cancelled) setPublishError(e instanceof Error ? e.message : String(e))
      }
    }, 350)
    return () => { cancelled = true; window.clearTimeout(t) }
    // `sig` changes only when file contents change; `nonce` forces a manual reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, nonce])

  useEffect(() => () => {
    if (token.current && inTauri()) void import('@tauri-apps/api/core').then(({ invoke }) => invoke('preview_clear', { token: token.current }))
  }, [])

  // Runtime errors from inside the sandboxed page.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return
      if (e.data?.zp === 'preview-error') setError(String(e.data.message))
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const active = codePath ?? files[0]?.path ?? null
  const activeFile = files.find((f) => f.path === active)
  const building = !!run && ['planning', 'running', 'reviewing'].includes(run.status)

  if (!run) {
    return <EmptyState icon={MonitorPlay} title="Nothing to preview yet" description="Run a task that builds something visual — a page, a component, an app — and it will appear here." className="py-24" />
  }

  return (
    <div className="flex h-[min(640px,calc(100vh-290px))] min-h-[420px] flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <Segmented size="sm" value={tab} onChange={setTab} options={[
          { value: 'preview', label: <span className="flex items-center gap-1.5"><MonitorPlay className="h-3.5 w-3.5" />Preview</span> },
          { value: 'code', label: <span className="flex items-center gap-1.5"><Code2 className="h-3.5 w-3.5" />Code · {files.length}</span> },
        ]} />
        {tab === 'preview' && bundle.kind !== 'none' && (
          <>
            <div className="flex rounded-lg border border-line bg-night/60 p-0.5">
              {(Object.keys(DEVICES) as Device[]).map((d) => {
                const Icon = DEVICES[d].icon
                return (
                  <button key={d} onClick={() => setDevice(d)} title={DEVICES[d].label} aria-label={DEVICES[d].label}
                    className={cn('rounded-md p-1.5 transition-colors', device === d ? 'bg-azure/30 text-white' : 'text-ink-3 hover:text-ink')}>
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                )
              })}
            </div>
            <button onClick={() => { setError(null); setNonce((n) => n + 1) }} title="Reload preview" aria-label="Reload preview" className="rounded-md border border-line p-1.5 text-ink-3 transition-colors hover:border-line-hi hover:text-ink">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-3">
          {building && <Loader2 className="h-3 w-3 animate-spin text-azure-hi" />}
          {building ? 'Updates as agents finish' : bundle.kind === 'none' ? '' : `${bundle.kind === 'react' ? 'React app' : 'Static site'} · ${bundle.files.length} files`}
        </span>
      </div>

      {tab === 'preview' ? (
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-[repeating-conic-gradient(rgba(120,170,255,0.05)_0%_25%,transparent_0%_50%)] [background-size:20px_20px]">
          {bundle.kind === 'none' ? (
            <EmptyState
              icon={MonitorPlay}
              title={files.length === 0 ? (building ? 'Waiting for the first finished agent…' : 'No files to preview') : 'No visual preview for this output'}
              description={files.length === 0 ? 'Previews appear when an agent finishes a page or component.' : bundle.note}
              className="h-full"
              action={files.length > 0 ? <button className="text-xs text-azure-hi underline-offset-2 hover:underline" onClick={() => setTab('code')}>View the code instead</button> : undefined}
            />
          ) : !inTauri() && bundle.kind === 'react' ? (
            <EmptyState icon={MonitorPlay} title="React previews need the desktop app" description="Open ZeroPulse Swarm from your desktop to preview React code. Static HTML previews work in the browser." className="h-full" />
          ) : (
            <div className="mx-auto h-full transition-[width] duration-300" style={{ width: DEVICES[device].w, maxWidth: '100%' }}>
              {(src || srcdoc) ? (
                <iframe
                  ref={frame} key={`${sig}:${nonce}`} title="App preview"
                  // Served previews run on their own origin (127.0.0.1:port), so same-origin lets apps use localStorage
                  // without being able to reach this app, its storage or its IPC. A srcdoc would share OUR origin, so it stays fully sandboxed.
                  sandbox={src ? 'allow-scripts allow-forms allow-modals allow-same-origin' : 'allow-scripts allow-forms allow-modals'}
                  {...(src ? { src } : { srcDoc: srcdoc ?? '' })}
                  className="h-full w-full bg-white"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-ink-3"><Loader2 className="h-5 w-5 animate-spin" /></div>
              )}
            </div>
          )}
          {(error || publishError) && (
            <div className="absolute inset-x-3 bottom-3 flex items-start gap-2 rounded-xl border border-bad/40 bg-void/90 p-2.5 text-[11.5px] text-bad backdrop-blur">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{publishError ?? error}</span>
              <button className="ml-auto shrink-0 text-ink-3 hover:text-ink" onClick={() => { setError(null); setPublishError(null) }}>Dismiss</button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[230px_1fr] overflow-hidden rounded-2xl border border-line">
          <ul className="min-h-0 space-y-0.5 overflow-y-auto border-r hairline p-2">
            {files.length === 0 && <li className="p-2 text-xs text-ink-4">No finished files yet.</li>}
            {files.map((f) => (
              <li key={f.path}>
                <button onClick={() => setCodePath(f.path)} className={cn('w-full rounded-lg px-2 py-1.5 text-left transition-colors', active === f.path ? 'bg-azure/15' : 'hover:bg-white/[0.04]')}>
                  <p className="truncate font-mono text-[11px] text-ink" title={f.path}>{f.path}</p>
                  <p className="text-[10px]" style={{ color: ROLE_META[f.role].color }}>{ROLE_META[f.role].short}</p>
                </button>
              </li>
            ))}
          </ul>
          <pre className="selectable min-h-0 overflow-auto bg-night/40 p-3 font-mono text-[11.5px] leading-[1.55] text-ink-2">{activeFile?.content ?? ''}</pre>
        </div>
      )}

      {tab === 'preview' && bundle.kind !== 'none' && bundle.note && bundle.kind === 'react' && (
        <p className="text-[11px] text-ink-4">{bundle.note}</p>
      )}
    </div>
  )
}
