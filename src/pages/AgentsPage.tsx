import { motion } from 'framer-motion'
import { ChevronDown, Lock, Plus, RotateCcw, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { ProviderTag } from '@/components/common/ProviderTag'
import { Button } from '@/components/ui/button'
import { Select, Textarea } from '@/components/ui/fields'
import { Switch } from '@/components/ui/switch'
import { ROLE_SKILLS } from '@/data/skills'
import { autoAssign, type Policy } from '@/engine/strengths'
import { ROLE_META } from '@/lib/meta'
import { cn, formatCost } from '@/lib/utils'
import { useApp } from '@/store/app'
import type { AgentDefinition } from '@/types'

function AgentCard({ agent, index }: { agent: AgentDefinition; index: number }) {
  const providers = useApp((s) => s.providers)
  const update = useApp((s) => s.updateAgent)
  const [draft, setDraft] = useState('')
  const [showSkill, setShowSkill] = useState(false)
  const meta = ROLE_META[agent.role]
  const Icon = meta.icon
  const provider = providers.find((p) => p.id === agent.providerId)
  const model = provider?.models.find((m) => m.id === agent.modelId)
  const skill = agent.skill ?? ROLE_SKILLS[agent.role]
  const customised = agent.skill !== undefined && agent.skill !== ROLE_SKILLS[agent.role]

  const setProvider = (providerId: string) => {
    const p = providers.find((x) => x.id === providerId)
    if (p) update(agent.id, { providerId, modelId: p.models[0].id, reason: undefined })
  }
  const addCap = () => {
    const v = draft.trim()
    if (v && !agent.capabilities.includes(v)) update(agent.id, { capabilities: [...agent.capabilities, v] })
    setDraft('')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}
      className={cn('glass rounded-2xl p-4 transition-opacity', !agent.enabled && 'opacity-55')}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${meta.color}1f`, color: meta.color, boxShadow: `inset 0 0 0 1px ${meta.color}40` }}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-ink">{agent.name}</h3>
            {agent.core && <span className="flex items-center gap-1 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-ink-3"><Lock className="h-2.5 w-2.5" />Core</span>}
          </div>
          <p className="mt-0.5 text-[12px] text-ink-3">{agent.description}</p>
        </div>
        <Switch checked={agent.enabled} disabled={agent.core} onCheckedChange={(enabled) => update(agent.id, { enabled })} aria-label={`Enable ${agent.name}`} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Provider</span>
          <Select value={agent.providerId} onChange={(e) => setProvider(e.target.value)}>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.verified ? ' ✓' : p.status !== 'connected' ? ' (offline)' : ''}</option>)}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Default model</span>
          <Select value={agent.modelId} onChange={(e) => update(agent.id, { modelId: e.target.value, reason: undefined })}>
            {provider?.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </Select>
        </label>
      </div>
      {agent.reason && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-3">
          <Sparkles className="mt-px h-3 w-3 shrink-0 text-azure-hi" /><span>Chosen for: {agent.reason}</span>
        </p>
      )}

      <div className="mt-3">
        <button onClick={() => setShowSkill((s) => !s)} className="flex w-full items-center gap-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-ink-3 transition-colors hover:text-ink-2">
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !showSkill && '-rotate-90')} />
          Skill — how this agent works {customised && <span className="rounded bg-azure/20 px-1.5 py-px normal-case tracking-normal text-azure-hi">edited</span>}
        </button>
        {showSkill && (
          <div className="mt-2">
            <Textarea rows={7} value={skill} onChange={(e) => update(agent.id, { skill: e.target.value })} className="font-mono text-[11.5px] leading-relaxed" aria-label={`${agent.name} skill`} />
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-4">
              <span>Sent as this agent&apos;s standing instructions on every run.</span>
              {customised && <button className="flex items-center gap-1 text-azure-hi hover:underline" onClick={() => update(agent.id, { skill: undefined })}><RotateCcw className="h-3 w-3" />Reset</button>}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Capabilities</span>
        <div className="flex flex-wrap gap-1.5">
          {agent.capabilities.map((c) => (
            <span key={c} className="group inline-flex items-center gap-1 rounded-md border border-azure/20 bg-azure/10 px-2 py-0.5 text-[11px] text-sky">
              {c}
              <button aria-label={`Remove ${c}`} onClick={() => update(agent.id, { capabilities: agent.capabilities.filter((x) => x !== c) })} className="text-sky/50 hover:text-sky"><X className="h-3 w-3" /></button>
            </span>
          ))}
          <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-line px-1.5">
            <Plus className="h-3 w-3 text-ink-4" />
            <input
              value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCap()} onBlur={addCap}
              placeholder="Add" className="w-16 bg-transparent py-0.5 text-[11px] text-ink outline-none placeholder:text-ink-4"
            />
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-3">
        Routes to <ProviderTag providerId={agent.providerId} label={model?.label ?? agent.modelId} />
        {model && (model.inputCostPer1M + model.outputCostPer1M > 0
          ? <span className="font-mono text-ink-4">${model.inputCostPer1M}/${model.outputCostPer1M} per 1M</span>
          : <span className="text-ok">free · local</span>)}
      </div>
    </motion.div>
  )
}

const POLICIES: { id: Policy; label: string; hint: string }[] = [
  { id: 'saver', label: 'Token saver', hint: 'Paid models only plan & review; cheap/local models do the bulk' },
  { id: 'balanced', label: 'Balanced', hint: 'Mix price and quality' },
  { id: 'quality', label: 'Best quality', hint: 'Strongest model per role, cost matters little' },
]

/** One-click: give every agent the model best suited to its job. */
function AutoAssign() {
  const providers = useApp((s) => s.providers)
  const agents = useApp((s) => s.agents)
  const update = useApp((s) => s.updateAgent)
  const [policy, setPolicy] = useState<Policy>('saver')
  const [done, setDone] = useState<string | null>(null)

  // Prefer providers that passed a connection test; fall back to anything marked connected.
  const pool = useMemo(() => {
    const verified = providers.filter((p) => p.verified && p.status === 'connected')
    return verified.length ? verified : providers.filter((p) => p.status === 'connected')
  }, [providers])
  const usingVerified = pool.some((p) => p.verified)
  const modelCount = pool.reduce((n, p) => n + p.models.length, 0)

  const run = () => {
    const picks = autoAssign(agents, pool, policy)
    picks.forEach((a) => update(a.agentId, { providerId: a.providerId, modelId: a.modelId, reason: a.reason }))
    const distinct = new Set(picks.map((a) => `${a.providerId}/${a.modelId}`)).size
    const paid = picks.filter((a) => {
      const m = providers.find((p) => p.id === a.providerId)?.models.find((x) => x.id === a.modelId)
      return m && m.inputCostPer1M + m.outputCostPer1M > 0
    }).length
    const paidText = paid === 0 ? 'none use a paid model' : paid === 1 ? '1 uses a paid model' : `${paid} use paid models`
    setDone(`Assigned ${picks.length} agents across ${distinct} different model${distinct === 1 ? '' : 's'}; ${paidText}.`)
  }

  return (
    <div className="glass mb-5 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><Sparkles className="h-4 w-4 text-azure-hi" />Auto-assign models by strengths</span>
        <div className="w-[170px]"><Select value={policy} onChange={(e) => setPolicy(e.target.value as Policy)} aria-label="Assignment policy">{POLICIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></div>
        <Button variant="primary" disabled={modelCount === 0} onClick={run}>Auto-assign</Button>
      </div>
      <p className="mt-2 text-[12px] text-ink-3">
        {POLICIES.find((p) => p.id === policy)?.hint}. Picking from {modelCount} model{modelCount === 1 ? '' : 's'} on {pool.length} provider{pool.length === 1 ? '' : 's'}
        {usingVerified ? ' you have verified' : ' (none verified yet — test connections on the Integrations page for real results)'}.
      </p>
      {done && <p className="mt-1.5 text-[12px] text-ok">{done}</p>}
    </div>
  )
}

export function AgentsPage() {
  const agents = useApp((s) => s.agents)
  const providers = useApp((s) => s.providers)
  const enabled = agents.filter((a) => a.enabled).length

  // Rough price of one agent-turn each (1K in / 1K out), to show where the money would go.
  const spend = agents.filter((a) => a.enabled).map((a) => {
    const m = providers.find((p) => p.id === a.providerId)?.models.find((x) => x.id === a.modelId)
    return m ? (m.inputCostPer1M + m.outputCostPer1M) / 1000 : 0
  })

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-[1180px]">
        <PageHeader
          title="Agents"
          description={`${enabled} of ${agents.length} roles enabled. Spread the work across models so no single one — or paid plan — carries it all. A 1K-in/1K-out turn across the whole team costs about ${formatCost(spend.reduce((a, b) => a + b, 0))}.`}
        />
        <AutoAssign />
        <div className="grid grid-cols-2 gap-4 max-xl:grid-cols-1">
          {agents.map((a, i) => <AgentCard key={a.id} agent={a} index={i} />)}
        </div>
      </div>
    </div>
  )
}
