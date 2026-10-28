import { DeepSeekPanel } from '@/components/DeepSeekPanel'
import { useEffect, useState } from 'react'
import { useApp } from '@/store/app'
import { DEFAULT_MODEL_POLICY, type ModelChoice } from '@/engine/modelPolicy'
import { telegramInvoke } from '@/lib/telegramBots'
import { inTauri, testConnection } from '@/providers'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/fields'
interface Catalog { id: string; label: string; efforts: string[]; isDefault: boolean }
interface Usage { provider: string; model: string; runId: string; at: number; status: string; inputTokens: number | null; outputTokens: number | null }
export function ModelControlPage() {
  const { providers, agents, projects, activeProjectId, preferences, updatePreferences, updateProvider } = useApp()
  const policy = { ...DEFAULT_MODEL_POLICY, ...preferences.modelPolicy }
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(''), [usage, setUsage] = useState<Usage[]>([])
  useEffect(() => { if (inTauri()) void telegramInvoke<Usage[]>('cli_usage').then(setUsage).catch(() => {}) }, [])
  const save = (patch: Partial<typeof policy>) => updatePreferences({ modelPolicy: { ...policy, ...patch } })
  const setChoice = (scope: 'defaults' | 'task', id: string, model: string, effort?: string) => {
    const next = { ...policy[scope] }; if (!model) delete next[id]; else next[id] = { model, effort }; save({ [scope]: next })
  }
  const discover = async (id: string) => {
    setBusy(id); setNotice('')
    try {
      const p = providers.find((p) => p.id === id)!
      if (p.local) { const r = await testConnection(p); if (!r.ok) throw new Error(r.error); updateProvider(id, r.next!); setNotice('On-device model list refreshed.'); return }
      const models = await telegramInvoke<Catalog[]>('cli_models', { provider: id })
      const base = p.models[0]
      updateProvider(id, { models: [{ ...base, id: 'default', label: 'Verified CLI default · identity unobserved', efforts: [] }, ...models.map((m) => ({ ...base, id: m.id, label: m.label, efforts: m.efforts, verifiedAt: Date.now() }))] })
      setNotice('Actual CLI catalog refreshed without inference. Model availability does not prove included billing. Explicit models require discovery each app session.')
    } catch (e) { setNotice(String(e)) } finally { setBusy('') }
  }
  const providerRows = providers.filter((p) => p.subscription || p.local || p.id === 'deepseek')
  const picker = (id: string, choice: ModelChoice | undefined, change: (model: string) => void) => <Select value={choice?.model ?? ''} onChange={(e) => change(e.target.value)}><option value="">Inherit policy</option>{providers.find((p) => p.id === id)?.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>
  return <div className="h-full space-y-5 overflow-y-auto p-6">
    <PageHeader title="Model Control Center" description="Your model choices, enforced before each call. Automatic escalation and generic paid APIs are blocked." />
    <DeepSeekPanel /><section className="mission-panel grid gap-4 p-5 md:grid-cols-3">
      <label className="space-y-2 text-xs">Routing profile<Select value={policy.profile} onChange={(e) => save({ profile: e.target.value as typeof policy.profile })}><option value="economy">Economy</option><option value="balanced">Balanced</option><option value="performance">Performance · selected models only</option><option value="manual">Manual Lock</option></Select></label>
      <label className="space-y-2 text-xs">Maximum calls per task · local cap<input aria-label="Task call cap" type="number" min={1} max={8} className="w-full rounded-lg border hairline bg-night p-2" value={policy.maxCalls} onChange={(e) => save({ maxCalls: Math.max(1, Math.min(8, +e.target.value)) })} /></label>
      <label className="space-y-2 text-xs">Call timeout · seconds<input aria-label="Call timeout" type="number" min={15} max={300} className="w-full rounded-lg border hairline bg-night p-2" value={policy.timeoutSeconds} onChange={(e) => save({ timeoutSeconds: Math.max(15, Math.min(300, +e.target.value)) })} /></label>
      <p className="text-xs text-ink-3 md:col-span-3">One concurrent call per provider. Native subscription limit: 40 starts/provider/UTC day and eight starts/task, including failed attempts. Economy limits worker concurrency to one; review is always retained. Performance never authorizes a model upgrade.</p>
    </section>
    {notice && <p role="status" className="rounded-xl border hairline p-3 text-xs text-azure-hi">{notice}</p>}
    <div className="grid gap-4 xl:grid-cols-2">{providerRows.map((p) => {
      const rows = usage.filter((r) => r.provider === p.id && r.status === 'started'), last = rows[0]
      return <section key={p.id} className="mission-panel space-y-3 p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">{p.name}</h2><span className="text-[10px] text-ink-3">{p.verified ? 'Connection verified previously' : 'Not configured'} · {p.local ? 'On-device' : p.subscription ? 'Subscription CLI' : 'Paid opt-in'}</span></div>
        <p className="text-xs text-ink-3">{p.local ? 'Local activity; no cloud fallback.' : 'Remaining allowance unavailable — local estimate only'}</p>
        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs">Global provider default{picker(p.id, policy.defaults[p.id], (m) => setChoice('defaults', p.id, m))}</label><label className="space-y-1 text-xs">Explicit next-task override{picker(p.id, policy.task[p.id], (m) => setChoice('task', p.id, m))}</label></div>
        <label className="block space-y-1 text-xs">Project preference · {projects.find((v) => v.id === activeProjectId)?.name}{picker(p.id, policy.projects[activeProjectId]?.[p.id], (model) => { const next = { ...policy.projects[activeProjectId] }; if (model) next[p.id] = { model }; else delete next[p.id]; save({ projects: { ...policy.projects, [activeProjectId]: next } }) })}</label>
        <p className="text-[11px] text-ink-4">Locally recorded starts: {rows.length} · Last: {last ? new Date(last.at * 1000).toLocaleString() : 'Unavailable'} · Shared pool: account-specific, unverified</p>
        <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!inTauri() || !!busy} onClick={() => void discover(p.id)}>{busy === p.id ? 'Discovering…' : 'Refresh supported model catalog'}</Button>{p.id === 'cursor-cli' && <Button size="sm" disabled={!policy.defaults[p.id]?.model} onClick={() => void telegramInvoke('cli_confirm_included', { model: policy.defaults[p.id]?.model }).then(() => setNotice('Owner-configured included-model entitlement saved. No live quota was claimed.')).catch((e) => setNotice(String(e)))}>Confirm included usage…</Button>}</div>
      </section>
    })}</div>
    <section className="mission-panel space-y-4 p-5"><h2 className="font-semibold">Agent manual locks</h2><p className="text-xs text-ink-3">Task override → agent lock → project preference → global default → verified provider default. Unavailable selections pause; there is no fallback.</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{agents.map((a) => <div key={a.id} className="space-y-2"><label className="block text-xs">{a.name}{picker(a.providerId, policy.locks[a.id], (model) => { const next = { ...policy.locks }; if (model) next[a.id] = { model }; else delete next[a.id]; save({ locks: next }) })}</label>{policy.locks[a.id] && <label className="block text-[11px] text-ink-3">Reasoning effort<Select value={policy.locks[a.id].effort ?? ''} onChange={(e) => save({ locks: { ...policy.locks, [a.id]: { ...policy.locks[a.id], effort: e.target.value || undefined } } })}><option value="">Provider default · unobserved</option>{providers.find((p) => p.id === a.providerId)?.models.find((m) => m.id === policy.locks[a.id].model)?.efforts?.map((e) => <option key={e}>{e}</option>)}</Select></label>}</div>)}</div></section>
  </div>
}
