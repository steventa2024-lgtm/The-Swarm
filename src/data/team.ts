import type { AgentRole, Provider } from '@/types'

export const TEAM = [
  { id: 'codex', name: 'ChatGPT · Codex', title: 'Chief engineer', role: 'planner', color: '#6ee7b7', personality: 'Calm, direct, systems-minded.', setup: 'Install Codex CLI, run codex login, choose Sign in with ChatGPT. Access depends on your plan.', docs: 'https://developers.openai.com/codex/auth' },
  { id: 'claude-code', name: 'Claude Code', title: 'Principal engineer', role: 'backend', color: '#e9ae8c', personality: 'Methodical, precise, challenges assumptions.', setup: 'Install Claude Code and run claude to sign in with an eligible Claude subscription.', docs: 'https://code.claude.com/docs/en/setup' },
  { id: 'gemini-cli', name: 'Gemini', title: 'Front end & UI lead', role: 'frontend', color: '#93b4ff', personality: 'Visual, curious, attentive to accessibility.', setup: 'Install Gemini CLI and sign in with Google. CLI quotas and plan eligibility are separate from API billing.', docs: 'https://geminicli.com/docs/get-started/authentication/' },
  { id: 'cursor-cli', name: 'Cursor', title: 'QA & integration', role: 'qa', color: '#e3dcff', personality: 'Skeptical, evidence-first, concise.', setup: 'Install the Cursor Agent CLI (agent), then agent login. The Cursor editor command is not the Agent CLI.', docs: 'https://cursor.com/docs/cli/headless' },
  { id: 'grok', name: 'Grok', title: 'Research', role: 'researcher', color: '#c6d0df', personality: 'Inquisitive, candid, asks for sources.', setup: 'Manual research only. No supported subscription CLI has been verified. No xAI API fallback is enabled.', docs: 'https://docs.x.ai/docs/overview' },
  { id: 'ollama', name: 'Ollama', title: 'Offline support', role: 'docs', color: '#b7ced0', personality: 'Practical, patient, resource-conscious.', setup: 'Start Ollama, pull a local model, then Test & connect under Local models.', docs: 'https://docs.ollama.com/' },
] as const

export const cliProviders: Provider[] = TEAM.filter((t) => !['grok', 'ollama'].includes(t.id)).map((t) => ({
  id: t.id, name: t.name, kind: 'cli', endpoint: t.id, local: false, subscription: true,
  status: 'unconfigured', verified: false,
  models: [{ id: 'default', label: 'Signed-in CLI default', tier: 'balanced', contextWindow: 32000, inputCostPer1M: 0, outputCostPer1M: 0, tokensPerSecond: 40 }],
}))

export function teamFor(role: AgentRole) { return TEAM.find((t) => t.role === role) ?? TEAM[1] }
