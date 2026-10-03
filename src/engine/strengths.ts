import type { AgentDefinition, AgentRole, ModelInfo, Provider } from '@/types'

/**
 * Gives every available model a strengths profile and assigns each agent the
 * model best suited to its job — while keeping paid models for the low-volume
 * jobs (planning, review) and cheap/local models for the high-volume ones.
 * That is what makes a big task cheap: the expensive model reads the prompt once
 * and judges the result once; free or cheap models write the bulk.
 *
 * Profiles are heuristics from the model id and its listed tier/price, not
 * benchmarks. They only decide defaults; every assignment can be changed by hand.
 */

export interface Skills { reasoning: number; coding: number; writing: number; speed: number }

export interface Profile {
  skills: Skills
  /** USD per 1M tokens, input-weighted blend. 0 for local models. */
  cost: number
  premium: boolean
  local: boolean
}

export type Policy = 'saver' | 'balanced' | 'quality'

const clamp = (n: number, lo = 0, hi = 10) => Math.min(hi, Math.max(lo, n))

export function profileModel(m: ModelInfo, p: Provider): Profile {
  const id = `${m.id} ${m.label}`.toLowerCase()
  const size = Number(id.match(/(\d+(?:\.\d+)?)\s*b\b/)?.[1])
  let base = 6
  let speed = 6

  if (Number.isFinite(size)) {
    base = clamp(2 + Math.log2(size) * 1.2, 2, 9.5)
    speed = clamp(10 - Math.log2(size) * 1.1, 2, 9.5)
  } else if (m.tier === 'frontier') { base = 9; speed = 5 }
  else if (m.tier === 'balanced') { base = 8; speed = 7 }
  else if (m.tier === 'fast') { base = 6.5; speed = 9 }
  else if (m.tier === 'local') { base = 5; speed = 5 }

  let reasoning = base
  let coding = base
  let writing = base

  if (/coder|code/.test(id)) { coding += 2; reasoning -= 0.5; writing -= 1 }
  if (/\br1\b|reason|think|\bo[134]\b|opus|gpt-5/.test(id)) { reasoning += 2; speed -= 2 }
  if (/mini|nano|haiku|flash|lite|small|instant/.test(id)) { speed += 2; reasoning -= 1; coding -= 1 }
  if (/instruct|chat|sonnet|gpt-4/.test(id)) writing += 0.5

  const cost = p.local ? 0 : (m.inputCostPer1M * 3 + m.outputCostPer1M) / 4
  return {
    skills: { reasoning: clamp(reasoning), coding: clamp(coding), writing: clamp(writing), speed: clamp(speed) },
    cost,
    premium: cost > 3,
    local: p.local,
  }
}

interface Need extends Skills { volume: number; premiumOk: boolean }

/** What each role needs, and how many tokens it burns (volume 0..1). */
const NEEDS: Record<AgentRole, Need> = {
  planner:    { reasoning: 0.55, coding: 0.2,  writing: 0.25, speed: 0,    volume: 0.15, premiumOk: true },
  reviewer:   { reasoning: 0.5,  coding: 0.45, writing: 0.05, speed: 0,    volume: 0.2,  premiumOk: true },
  backend:    { reasoning: 0.3,  coding: 0.65, writing: 0.05, speed: 0,    volume: 1,    premiumOk: false },
  frontend:   { reasoning: 0.15, coding: 0.6,  writing: 0.15, speed: 0.1,  volume: 1,    premiumOk: false },
  qa:         { reasoning: 0.2,  coding: 0.5,  writing: 0,    speed: 0.3,  volume: 0.7,  premiumOk: false },
  docs:       { reasoning: 0,    coding: 0.1,  writing: 0.6,  speed: 0.3,  volume: 0.6,  premiumOk: false },
  researcher: { reasoning: 0.35, coding: 0,    writing: 0.3,  speed: 0.35, volume: 0.6,  premiumOk: false },
}

/** Most important roles choose first, so the best models go where they matter. */
const ORDER: AgentRole[] = ['planner', 'reviewer', 'backend', 'frontend', 'qa', 'docs', 'researcher']

const COST_WEIGHT: Record<Policy, number> = { saver: 2.5, balanced: 1.2, quality: 0.3 }
/** Reusing a model costs points, so the team spreads across models. Best-quality mode allows more reuse of the top model. */
const DIVERSITY_PENALTY: Record<Policy, number> = { saver: 2.2, balanced: 2.2, quality: 1 }

export interface Assignment { agentId: string; providerId: string; modelId: string; reason: string }

interface Candidate { provider: Provider; model: ModelInfo; profile: Profile }

function why(role: AgentRole, c: Candidate): string {
  const n = NEEDS[role]
  const s = c.profile.skills
  const facets = (['reasoning', 'coding', 'writing', 'speed'] as const)
    .filter((k) => n[k] >= 0.25)
    .sort((a, b) => n[b] * s[b] - n[a] * s[a])
    .slice(0, 2)
    .map((k) => `${k} ${s[k].toFixed(1)}/10`)
  const price = c.profile.local ? 'free & local' : c.profile.premium ? 'premium — used where tokens are few' : 'low cost'
  const load = n.volume >= 0.6 ? 'high-volume work' : 'low-volume work'
  return `${facets.join(', ')} · ${price} · ${load}`
}

export function autoAssign(agents: AgentDefinition[], providers: Provider[], policy: Policy = 'saver'): Assignment[] {
  const pool: Candidate[] = providers.flatMap((provider) =>
    provider.models.map((model) => ({ provider, model, profile: profileModel(model, provider) })),
  )
  if (pool.length === 0) return []

  const used = new Map<string, number>()
  const out: Assignment[] = []

  for (const role of ORDER) {
    const agent = agents.find((a) => a.role === role && a.enabled)
    if (!agent) continue
    const need = NEEDS[role]

    const scored = pool.map((c) => {
      const s = c.profile.skills
      let score = s.reasoning * need.reasoning + s.coding * need.coding + s.writing * need.writing + s.speed * need.speed
      score -= COST_WEIGHT[policy] * need.volume * Math.min(c.profile.cost / 10, 3)
      if (policy === 'saver') {
        // Paid models are reserved for planning and review; anything paid also carries a flat toll on high-volume work.
        if (c.profile.premium && !need.premiumOk) score -= 6
        if (!c.profile.local) score -= 4 * need.volume
      }
      score -= DIVERSITY_PENALTY[policy] * (used.get(`${c.provider.id}/${c.model.id}`) ?? 0)
      return { c, score }
    })
    scored.sort((a, b) => b.score - a.score)
    const best = scored[0].c
    used.set(`${best.provider.id}/${best.model.id}`, (used.get(`${best.provider.id}/${best.model.id}`) ?? 0) + 1)
    out.push({ agentId: agent.id, providerId: best.provider.id, modelId: best.model.id, reason: why(role, best) })
  }
  return out
}
