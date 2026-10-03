import { Cpu, Cloud, Network } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import type { ProviderKind } from '@/types'

const ICON: Record<ProviderKind, typeof Cloud> = {
  anthropic: Cloud,
  'openai-compatible': Cloud,
  openrouter: Network,
  ollama: Cpu,
  llamacpp: Cpu,
}

export function ProviderTag({
  providerId, label, compact, className,
}: { providerId: string; label: string; compact?: boolean; className?: string }) {
  const provider = useApp((s) => s.providers.find((p) => p.id === providerId))
  const Icon = provider ? ICON[provider.kind] : Cloud
  return (
    <span
      title={provider ? `${provider.name} · ${label}` : label}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md border border-azure/25 bg-azure/10 px-1.5 py-0.5 font-mono text-[10.5px] text-sky',
        provider?.local && 'border-ok/25 bg-ok/10 text-ok',
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0 opacity-80" />
      <span className="truncate">{compact ? label.replace(/^Claude /, '') : label}</span>
    </span>
  )
}
