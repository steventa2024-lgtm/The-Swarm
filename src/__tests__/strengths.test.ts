import { describe, expect, it } from 'vitest'
import { seedAgents, seedProviders } from '@/data/seed'
import { autoAssign, profileModel } from '@/engine/strengths'
import type { ModelInfo, Provider } from '@/types'

const local = (id: string): ModelInfo => ({ id, label: id, tier: 'local', contextWindow: 32000, inputCostPer1M: 0, outputCostPer1M: 0, tokensPerSecond: 40 })

// The models actually installed in Ollama on the dev machine, plus the OpenAI models from the seed.
const ollama: Provider = {
  id: 'ollama', name: 'Ollama', kind: 'ollama', endpoint: 'http://localhost:11434', local: true, status: 'connected', verified: true,
  models: ['qwen3-coder:30b', 'qwen3:8b', 'qwen2.5-coder:14b', 'qwen2.5-coder:7b', 'qwen2.5-coder:1.5b', 'deepseek-r1:8b', 'deepseek-coder:6.7b'].map(local),
}
const openai = seedProviders.find((p) => p.id === 'openai')!

describe('profileModel', () => {
  it('rates coder models high at coding and reasoning models high at reasoning', () => {
    const coder = profileModel(local('qwen3-coder:30b'), ollama).skills
    const r1 = profileModel(local('deepseek-r1:8b'), ollama).skills
    expect(coder.coding).toBeGreaterThan(coder.reasoning)
    expect(r1.reasoning).toBeGreaterThan(r1.coding)
  })
  it('treats bigger local models as stronger and smaller ones as faster', () => {
    const big = profileModel(local('qwen2.5-coder:14b'), ollama).skills
    const small = profileModel(local('qwen2.5-coder:1.5b'), ollama).skills
    expect(big.coding).toBeGreaterThan(small.coding)
    expect(small.speed).toBeGreaterThan(big.speed)
  })
  it('flags expensive hosted models as premium and local ones as free', () => {
    expect(profileModel(openai.models[0], openai).premium).toBe(true) // gpt-4.1
    expect(profileModel(openai.models[1], openai).premium).toBe(false) // gpt-4.1-mini
    expect(profileModel(local('qwen2.5-coder:7b'), ollama).cost).toBe(0)
  })
})

describe('autoAssign (token saver)', () => {
  const picks = autoAssign(seedAgents, [ollama, openai], 'saver')
  const byRole = (role: string) => picks.find((p) => p.agentId === seedAgents.find((a) => a.role === role)!.id)!
  const model = (p: { providerId: string; modelId: string }) =>
    [ollama, openai].find((x) => x.id === p.providerId)!.models.find((m) => m.id === p.modelId)!

  it('assigns every enabled agent', () => {
    expect(picks).toHaveLength(seedAgents.filter((a) => a.enabled).length)
  })
  it('never gives a paid premium model to a high-volume worker', () => {
    for (const role of ['backend', 'frontend', 'qa', 'docs', 'researcher']) {
      const m = model(byRole(role))
      expect(profileModel(m, [ollama, openai].find((p) => p.models.includes(m))!).premium, role).toBe(false)
    }
  })
  it('puts the paid model on planning (the low-volume job)', () => {
    expect(byRole('planner').providerId).toBe('openai')
  })
  it('keeps paid usage to the planning job when free local models can do the rest', () => {
    const paid = picks.filter((p) => p.providerId !== 'ollama').map((p) => seedAgents.find((a) => a.id === p.agentId)!.role)
    expect(paid).toEqual(['planner'])
  })
  it('uses several different models rather than one for everything', () => {
    const distinct = new Set(picks.map((p) => `${p.providerId}/${p.modelId}`))
    expect(distinct.size).toBeGreaterThanOrEqual(5)
  })
  it('gives coding roles a coder model and docs a general/fast one', () => {
    expect(byRole('backend').modelId).toMatch(/coder/)
    expect(byRole('frontend').modelId).toMatch(/coder/)
    expect(byRole('docs').modelId).not.toBe(byRole('backend').modelId)
  })
  it('explains each choice', () => {
    for (const p of picks) expect(p.reason.length).toBeGreaterThan(10)
  })
  it('best-quality mode is allowed to spend on workers, unlike token saver', () => {
    const q = autoAssign(seedAgents, [ollama, openai], 'quality')
    const paidWorkers = q.filter(
      (p) => p.providerId === 'openai' && !['planner', 'reviewer'].includes(seedAgents.find((a) => a.id === p.agentId)!.role),
    )
    expect(paidWorkers.length).toBeGreaterThan(0)
  })
  it('still works with a single model (everyone shares it)', () => {
    const only: Provider = { ...ollama, models: [local('qwen2.5-coder:7b')] }
    const one = autoAssign(seedAgents, [only], 'saver')
    expect(one.every((p) => p.modelId === 'qwen2.5-coder:7b')).toBe(true)
  })
  it('returns nothing when there are no models', () => {
    expect(autoAssign(seedAgents, [], 'saver')).toEqual([])
  })
})
