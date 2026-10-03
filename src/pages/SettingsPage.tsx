import { RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/fields'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { MODE_META } from '@/lib/meta'
import { formatTokens } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'
import type { Preferences, RunMode } from '@/types'

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="glass rounded-2xl p-5">
      <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
      {description && <p className="mt-0.5 text-[12px] text-ink-3">{description}</p>}
      <div className="mt-4 divide-y divide-[color:var(--color-line)]">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[13px] text-ink">{label}</p>
        {hint && <p className="text-[11.5px] text-ink-3">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const prefs = useApp((s) => s.preferences)
  const set = useApp((s) => s.updatePreferences)
  const providers = useApp((s) => s.providers)
  const updateProvider = useApp((s) => s.updateProvider)
  const resetData = useApp((s) => s.resetData)
  const p = <K extends keyof Preferences>(k: K) => (v: Preferences[K]) => set({ [k]: v } as Partial<Preferences>)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-[860px] space-y-4">
        <PageHeader title="Settings" description="Preferences are stored locally on this device." />

        <Section title="Appearance">
          <Row label="Theme" hint="Midnight Blue is the only theme in this build."><span className="rounded-lg border border-azure-hi/40 bg-azure/15 px-3 py-1.5 text-xs text-azure-hi">Midnight Blue</span></Row>
          <Row label="Reduce motion" hint="Turns off pulsing, flowing and entrance animations."><Switch checked={prefs.reduceMotion} onCheckedChange={p('reduceMotion')} /></Row>
          <Row label="Simulation speed" hint="Demo orchestrator only. Has no effect on a live backend.">
            <Segmented size="sm" value={prefs.simulationSpeed} onChange={p('simulationSpeed')} options={[{ value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 4, label: '4×' }]} />
          </Row>
        </Section>

        <Section title="Orchestrator" description="Choose what happens when you press Run.">
          <Row
            label="Engine"
            hint={prefs.orchestrator === 'live'
              ? 'Calls the models you have verified in Integrations. Your prompt and project notes are sent to those providers. Output is proposed only — nothing is written to disk.'
              : 'Plays a scripted demo. No network calls are made.'}
          >
            <Segmented size="sm" value={prefs.orchestrator} onChange={p('orchestrator')} options={[{ value: 'simulated', label: 'Simulated' }, { value: 'live', label: 'Live' }]} />
          </Row>
        </Section>

        <Section title="Swarm defaults">
          <Row label="Default agent count"><Segmented size="sm" value={prefs.defaultAgentCount} onChange={(v) => { p('defaultAgentCount')(v); useSwarm.getState().setAgentCount(v) }} options={[{ value: 'auto', label: 'Auto' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4' }]} /></Row>
          <Row label="Default mode">
            <div className="w-[200px]">
              <Select value={prefs.defaultMode} onChange={(e) => { p('defaultMode')(e.target.value as RunMode); useSwarm.getState().setMode(e.target.value as RunMode) }}>
                {(Object.keys(MODE_META) as RunMode[]).map((m) => <option key={m} value={m}>{MODE_META[m].label}</option>)}
              </Select>
            </div>
          </Row>
          <Row label="Max concurrent workers" hint="Hard cap, regardless of what the orchestrator wants.">
            <Segmented size="sm" value={prefs.maxConcurrency} onChange={p('maxConcurrency')} options={[{ value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4' }]} />
          </Row>
        </Section>

        <Section title="Token budget" description="A guard against runaway spend, tracked per rolling 24 hours.">
          <Row label="Budget mode">
            <Segmented size="sm" value={prefs.tokenBudgetMode} onChange={p('tokenBudgetMode')} options={[{ value: 'strict', label: 'Strict' }, { value: 'balanced', label: 'Balanced' }, { value: 'unlimited', label: 'Off' }]} />
          </Row>
          <Row label="Daily token budget" hint={`${formatTokens(prefs.tokenBudget)} tokens`}>
            <Input type="number" min={50_000} step={50_000} className="w-[140px] text-right font-mono" value={prefs.tokenBudget} onChange={(e) => set({ tokenBudget: Math.max(50_000, Number(e.target.value) || 0) })} />
          </Row>
        </Section>

        <Section title="Providers" description="Endpoints are editable. API keys are read from the environment variable named here — they are never stored in app data.">
          {providers.map((pr) => (
            <div key={pr.id} className="grid grid-cols-[130px_1fr_170px] items-center gap-3 py-3 first:pt-0 last:pb-0 max-md:grid-cols-1">
              <span className="text-[13px] text-ink">{pr.name}</span>
              <Input value={pr.endpoint} onChange={(e) => updateProvider(pr.id, { endpoint: e.target.value })} className="font-mono text-xs" aria-label={`${pr.name} endpoint`} />
              {pr.local
                ? <span className="text-[11px] text-ok">Local — no key needed</span>
                : <Input value={pr.credentialRef ?? ''} onChange={(e) => updateProvider(pr.id, { credentialRef: e.target.value })} placeholder="ENV_VAR_NAME" className="font-mono text-xs" aria-label={`${pr.name} key variable`} />}
            </div>
          ))}
        </Section>

        <Section title="Data & privacy">
          <Row label="Keep run logs" hint="Stores activity logs with run history."><Switch checked={prefs.storeRunLogs} onCheckedChange={p('storeRunLogs')} /></Row>
          <Row label="Redact secrets in logs" hint="Masks tokens and keys before anything is stored."><Switch checked={prefs.redactSecrets} onCheckedChange={p('redactSecrets')} /></Row>
          <Row label="Usage telemetry" hint="Off by default. This build sends nothing either way."><Switch checked={prefs.telemetry} onCheckedChange={p('telemetry')} /></Row>
          <Row label="Reset local data" hint="Restores seed projects, agents, templates and history.">
            <Button variant="danger" size="sm" onClick={() => { if (window.confirm('Reset all local data to defaults?')) { resetData(); useSwarm.getState().reset() } }}><RotateCcw className="h-3.5 w-3.5" />Reset</Button>
          </Row>
        </Section>
      </div>
    </div>
  )
}
