import { motion } from 'framer-motion'
import { Cloud, Cpu, FolderLock, GitBranch, Hourglass, Loader2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { PageHeader, SectionTitle } from '@/components/common/PageHeader'
import { KeyField } from '@/components/common/KeyField'
import { StatusBadge } from '@/components/common/StatusBadge'
import { Button } from '@/components/ui/button'
import type { Tone } from '@/lib/meta'
import { testConnection } from '@/providers'
import { useApp } from '@/store/app'
import type { Integration } from '@/types'
import { TEAM } from '@/data/team'
import { TelegramPanel } from '@/components/swarm/TelegramPanel'

const CATS: { id: Integration['category']; title: string; icon: LucideIcon }[] = [
  { id: 'provider', title: 'Model providers', icon: Cloud },
  { id: 'local', title: 'Local models', icon: Cpu },
  { id: 'source-control', title: 'Source control', icon: GitBranch },
  { id: 'filesystem', title: 'File system', icon: FolderLock },
  { id: 'future', title: 'Coming later', icon: Hourglass },
]

const STATUS: Record<Integration['status'], { label: string; tone: Tone }> = {
  connected: { label: 'Connected', tone: 'success' },
  disconnected: { label: 'Offline', tone: 'warning' },
  unconfigured: { label: 'Not set up', tone: 'muted' },
  planned: { label: 'Planned', tone: 'violet' },
}

const PROVIDER_OF: Record<string, string> = {
  'int-anthropic': 'anthropic', 'int-openai': 'openai', 'int-openrouter': 'openrouter',
  'int-ollama': 'ollama', 'int-llamacpp': 'llamacpp',
}

interface TestState { busy?: boolean; ok?: boolean; message?: string }

export function IntegrationsPage() {
  const integrations = useApp((s) => s.integrations)
  const providers = useApp((s) => s.providers)
  const updateProvider = useApp((s) => s.updateProvider)
  const [tests, setTests] = useState<Record<string, TestState>>({})

  const test = async (id: string) => {
    const provider = providers.find((p) => p.id === id)
    if (!provider) return
    setTests((t) => ({ ...t, [id]: { busy: true } }))
    const res = await testConnection(provider)
    if (res.ok && res.next) {
      updateProvider(id, res.next)
      const warn = res.missing.length ? ` · ${res.missing.length} configured model${res.missing.length > 1 ? 's' : ''} not found: ${res.missing.slice(0, 2).join(', ')}` : ''
      const cloud = res.hiddenCloud ? ` · ${res.hiddenCloud} cloud-hosted hidden` : ''
      setTests((t) => ({ ...t, [id]: { ok: true, message: `${res.modelIds.length} models · ${res.latencyMs} ms${cloud}${warn}` } }))
    } else {
      updateProvider(id, { verified: false, status: 'disconnected' })
      setTests((t) => ({ ...t, [id]: { ok: false, message: res.error } }))
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-[1180px] space-y-7">
        <PageHeader
          title="Integrations"
          description="Approved connections only. Providers are configured with your own keys or local endpoints — the swarm never rotates accounts or works around provider limits. Live runs only use providers that pass a connection test."
        />
        <section><SectionTitle>Subscription CLIs · no API fallback</SectionTitle><div className="grid grid-cols-3 gap-3 max-lg:grid-cols-2">{TEAM.filter((t) => t.id !== 'ollama').map((member) => { const provider = providers.find((p) => p.id === member.id); const result = tests[member.id]; return <div key={member.id} className="mission-panel space-y-3 p-4"><h2 className="font-semibold" style={{ color: member.color }}>{member.name}</h2><p className="text-xs text-ink-2">{member.title}</p><p className="text-xs leading-relaxed text-ink-3">{member.setup}</p><p className="text-[11px] text-ink-3">Personality (optional): {member.personality}</p><p className="text-xs">{provider?.verified ? 'Verified by a real CLI response' : member.id === 'grok' ? 'Manual · automation unavailable' : 'Not verified'}</p>{result?.message && <p className={`text-xs ${result.ok ? 'text-ok' : 'text-bad'}`}>{result.message}</p>}<div className="flex items-center gap-3">{provider && <Button size="sm" variant="outline" disabled={result?.busy} onClick={() => void test(member.id)}>{result?.busy ? 'Probing…' : 'Test signed-in CLI'}</Button>}<a className="text-xs text-azure-hi underline" href={member.docs} target="_blank" rel="noreferrer">Setup ↗</a></div></div> })}</div></section>
        <section className="mission-panel p-5" aria-label="Telegram Bots integration"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Telegram Bots · seven identity slots</h2><p className="mt-1 text-xs text-ink-3">Headquarters, Codex, Claude, Gemini, Cursor, Grok and a reserved Ollama bot. Configure secure tokens, owner pairing, local polling and delivery evidence.</p></div><Button variant="primary" onClick={() => useApp.getState().setPage('telegram')}>Configure Telegram Bots</Button></div><p className="mt-3 text-xs text-ink-3">Each connection is verified against Telegram. Bot connectivity and AI provider availability are tracked separately.</p></section>
        <details className="mission-panel p-4"><summary className="cursor-pointer text-sm text-ink-2">Existing HTTPS webhook and voice controls</summary><div className="mt-4"><TelegramPanel /></div></details>
        {CATS.map((cat) => {
          const items = integrations.filter((i) => i.category === cat.id)
          if (!items.length) return null
          const CatIcon = cat.icon
          return (
            <section key={cat.id}>
              <SectionTitle><span className="inline-flex items-center gap-2"><CatIcon className="h-3.5 w-3.5" />{cat.title}</span></SectionTitle>
              <div className="grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-lg:grid-cols-1">
                {items.map((i, idx) => {
                  const providerId = PROVIDER_OF[i.id]
                  const provider = providers.find((p) => p.id === providerId)
                  const status = provider ? provider.status : i.status
                  const st = provider && status === 'connected' && !provider.verified
                    ? { label: 'Not tested', tone: 'muted' as Tone }
                    : STATUS[status]
                  const t = provider ? tests[provider.id] : undefined
                  return (
                    <motion.div key={i.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }} className="glass glass-hover flex flex-col rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-[14px] font-semibold text-ink">{i.name}</h3>
                        <StatusBadge tone={st.tone} label={provider?.verified ? 'Verified' : st.label} live={!!provider?.verified} />
                      </div>
                      <p className="mt-1.5 flex-1 text-[12px] text-ink-3">{i.description}</p>
                      {provider && !provider.local && provider.credentialRef && <KeyField name={provider.credentialRef} />}
                      {t?.message && <p className={`mt-2 break-words text-[11px] ${t.ok ? 'text-ok' : 'text-bad'}`}>{t.message}</p>}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[10.5px] text-ink-4">{provider?.endpoint ?? i.detail ?? ''}</span>
                        {provider && (
                          <span className="flex shrink-0 gap-1.5">
                            {provider.verified && (
                              <Button variant="ghost" size="sm" onClick={() => updateProvider(provider.id, { verified: false, status: 'disconnected' })}>Disconnect</Button>
                            )}
                            <Button variant={provider.verified ? 'outline' : 'primary'} size="sm" disabled={t?.busy || (!provider.local && !useApp.getState().preferences.paidApisEnabled)} onClick={() => test(provider.id)} title={!provider.local ? 'Paid APIs must be explicitly enabled in Settings first' : undefined}>
                              {t?.busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                              {provider.verified ? 'Re-test' : 'Test & connect'}
                            </Button>
                          </span>
                        )}
                        {!provider && i.status === 'unconfigured' && <Button variant="outline" size="sm" disabled title="Not available in this build">Set up</Button>}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
