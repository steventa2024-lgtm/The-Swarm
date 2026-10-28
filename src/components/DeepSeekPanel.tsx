import { useEffect, useState } from 'react'
import { telegramInvoke } from '@/lib/telegramBots'
import { useApp } from '@/store/app'
import { inTauri } from '@/providers/transport'
import { Button } from '@/components/ui/button'
interface Status { keyPresent: boolean; enabled: boolean; busy: boolean; models: string[]; approvedProjects: string[]; reservedUsd: number; dailyLimitUsd: number; calls: number; priceVerified: string; circuitOpen: boolean }
export function DeepSeekPanel() {
  const [status, setStatus] = useState<Status>(), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [daily, setDaily] = useState('0.50')
  const app = useApp(), project = app.projects.find((p) => p.id === app.activeProjectId)
  const refresh = () => telegramInvoke<Status>('deepseek_status').then(setStatus)
  useEffect(() => { if (inTauri()) void refresh().catch(() => {}) }, [])
  const act = async (command: string, args = {}) => {
    setBusy(true); setNotice('')
    try {
      const result = await telegramInvoke<{ models?: string[]; balance?: { is_available: boolean; balance_infos: Array<{ currency: string; total_balance: string }> }; balanceError?: string }>(command, args)
      if (command === 'deepseek_test') {
        app.updateProvider('deepseek', { models: (result.models ?? []).map((id) => ({ id, label: id, tier: 'balanced', contextWindow: 8000, inputCostPer1M: 0.3, outputCostPer1M: 1.2, tokensPerSecond: 30, verifiedAt: Date.now() })), verified: true, status: 'connected' })
        setNotice(result.balance ? `Provider-reported balance: ${result.balance.balance_infos.map((b) => `${b.currency} ${b.total_balance}`).join(', ')}. No inference requested.` : `Balance unavailable: ${result.balanceError ?? 'provider returned no balance'}. No inference requested.`)
      } else setNotice('Native setting updated. Paid calls still require session authorization and project egress permission.')
      await refresh()
    } catch (e) { setNotice(String(e)) } finally { setBusy(false) }
  }
  return <section className="mission-panel space-y-4 p-5" aria-label="DeepSeek secure integration"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-[#1cbfff]">DeepSeek · Architecture auditor</h2><p className="mt-1 text-xs text-ink-3">The sole permitted paid inference API · api.deepseek.com · HQ relays its Telegram updates.</p></div><span className="text-xs">{status?.enabled ? 'Paid session authorized' : status?.keyPresent ? 'Key saved · Paid use OFF' : 'Not configured · Paid use OFF'}</span></div>
    <p className="text-xs text-ink-3">${status?.dailyLimitUsd.toFixed(2) ?? '0.50'}/UTC day · One concurrent call · 40 calls/day · 32 KB input · 4096 output tokens. Reserved: ${status?.reservedUsd.toFixed(4) ?? '0.0000'} · {status?.calls ?? 0} calls. Unknown in-flight costs retain their full reservation.</p>
    <div className="flex flex-wrap items-center gap-2"><label className="text-xs">Daily USD <input aria-label="DeepSeek daily USD limit" className="w-20 rounded border hairline bg-night p-2" type="number" min="0.01" max="5" step="0.01" value={daily} onChange={(e) => setDaily(e.target.value)} /></label><Button size="sm" disabled={!inTauri() || busy} onClick={() => void act('deepseek_set_daily_limit', { usd: +daily })}>Set limit…</Button>{[['deepseek_key_dialog', status?.keyPresent ? 'Replace key…' : 'Save key in native dialog…'], ['deepseek_test', 'Test models & balance'], ['deepseek_enable', 'Authorize paid session…'], ['deepseek_disable', 'Disable'], ['deepseek_delete', 'Delete key']] .map(([command, label]) => <Button key={command} size="sm" disabled={!inTauri() || busy} onClick={() => void act(command)}>{label}</Button>)}<Button size="sm" disabled={!project?.root || busy || !inTauri()} onClick={() => void act('deepseek_allow_project', { projectId: project?.id, root: project?.root })}>Allow project cloud egress…</Button></div>
    <p className="text-[11px] text-ink-4">Prices: {status?.priceVerified ?? '2026-10-28 · peak cache-miss rates, 2x reserve'} · <a className="text-azure-hi" href="https://api-docs.deepseek.com/quick_start/pricing/" target="_blank" rel="noreferrer">Official pricing</a>. Price expiry blocks new use. Pro requires a separate native approval for every request. Search, automatic top-ups and all other paid APIs stay blocked. In-flight requests may bill; use provider account controls too.</p>
    {notice && <p role="status" className="text-xs text-azure-hi">{notice}</p>}{status?.circuitOpen && <p role="alert" className="text-xs text-bad">Circuit breaker open. Inspect errors before re-enabling.</p>}
  </section>
}
