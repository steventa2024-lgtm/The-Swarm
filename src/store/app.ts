import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  seedAgents, seedIntegrations, seedPreferences, seedProjects,
  seedProviders, seedTemplates,
} from '@/data/seed'
import { appStorage } from '@/persistence/storage'
import { withLegacyFallback } from '@/persistence/migration'
import { uid } from '@/lib/utils'
import { cliProviders, teamFor } from '@/data/team'
import type {
  AgentDefinition, Integration, PageId, Preferences, Project, ProjectMemory, Provider,
  RunSummary, SwarmView, Template,
} from '@/types'

interface AppState {
  // navigation (not persisted)
  page: PageId
  view: SwarmView
  hydrated: boolean

  // persisted workspace data
  activeProjectId: string
  providers: Provider[]
  agents: AgentDefinition[]
  projects: Project[]
  memory: ProjectMemory[]
  templates: Template[]
  integrations: Integration[]
  history: RunSummary[]
  preferences: Preferences

  setPage: (p: PageId) => void
  setView: (v: SwarmView) => void
  setActiveProject: (id: string) => void
  updateAgent: (id: string, patch: Partial<AgentDefinition>) => void
  updateProvider: (id: string, patch: Partial<Provider>) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  addProject: (name: string, root?: string) => void
  updatePreferences: (patch: Partial<Preferences>) => void
  addTemplate: (t: Omit<Template, 'id'>) => void
  deleteTemplate: (id: string) => void
  addMemory: (m: Omit<ProjectMemory, 'id' | 'updatedAt' | 'uses'>) => void
  deleteMemory: (id: string) => void
  /** Records that these notes were sent to a model as context. */
  noteUsed: (ids: string[]) => void
  pushHistory: (r: RunSummary) => void
  resetData: () => void
}

const seeds = () => ({
  activeProjectId: seedProjects[0].id,
  providers: [...cliProviders, { id: 'deepseek', name: 'DeepSeek', kind: 'openai-compatible' as const, endpoint: 'https://api.deepseek.com', local: false, status: 'unconfigured' as const, models: [] }, ...seedProviders.map((p) => ({ ...p, status: 'unconfigured' as const, verified: false }))],
  agents: seedAgents.map((a) => ({ ...a, name: `${teamFor(a.role).name} · ${a.role === 'reviewer' ? 'Reviewer' : teamFor(a.role).title}`, providerId: teamFor(a.role).id, modelId: teamFor(a.role).id === 'ollama' ? 'qwen2.5-coder:7b' : 'default', enabled: a.role !== 'researcher' })),
  projects: [{ ...seedProjects[0], name: 'The Swarm', path: 'Choose a project folder', stack: ['Local workspace'], branch: '—', lastRunAt: undefined, runCount: 0, description: 'Your persistent engineering workspace.' }],
  memory: [],
  templates: seedTemplates,
  integrations: seedIntegrations,
  history: [],
  preferences: { ...seedPreferences, teamVersion: 2, orchestrator: 'live' as const, paidApisEnabled: false, personalities: false, inactivityCheckIns: false },
})

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      page: 'swarm',
      view: 'graph',
      hydrated: false,
      ...seeds(),

      setPage: (page) => set({ page }),
      setView: (view) => set({ view }),
      setActiveProject: (activeProjectId) => set({ activeProjectId }),
      updateAgent: (id, patch) =>
        set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      updateProvider: (id, patch) =>
        set((s) => ({ providers: s.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      updateProject: (id, patch) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      addProject: (name, root) => set((s) => ({ projects: [...s.projects, { id: uid('proj'), name, path: root ?? 'Choose a folder', root, stack: [], branch: '—', status: 'healthy', runCount: 0, description: 'Local engineering project' }] })),
      updatePreferences: (patch) => set((s) => ({ preferences: { ...s.preferences, ...patch } })),
      addTemplate: (t) => set((s) => ({ templates: [{ ...t, id: uid('tpl') }, ...s.templates] })),
      deleteTemplate: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
      addMemory: (m) =>
        set((s) => ({ memory: [{ ...m, id: uid('mem'), updatedAt: Date.now(), uses: 0 }, ...s.memory] })),
      deleteMemory: (id) => set((s) => ({ memory: s.memory.filter((m) => m.id !== id) })),
      noteUsed: (ids) => set((s) => ({ memory: s.memory.map((m) => (ids.includes(m.id) ? { ...m, uses: m.uses + 1 } : m)) })),
      pushHistory: (r) =>
        set((s) => ({
          history: [r, ...s.history.filter((h) => h.id !== r.id)].slice(0, 100),
          projects: s.projects.map((p) =>
            p.id === r.projectId ? { ...p, lastRunAt: r.startedAt, runCount: p.runCount + 1 } : p,
          ),
        })),
      resetData: () => set({ ...seeds() }),
    }),
    {
      name: 'zeropulse-swarm/v2',
      storage: createJSONStorage(() => withLegacyFallback(appStorage, 'zeropulse-swarm/v1')),
      partialize: (s) => ({
        activeProjectId: s.activeProjectId,
        providers: s.providers,
        agents: s.agents,
        projects: s.projects,
        memory: s.memory,
        templates: s.templates,
        history: s.history,
        preferences: s.preferences,
      }),
      // Fill in preference keys added after a user's state was saved.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        const agents = (p.agents ?? current.agents).map((a) => {
          if (p.preferences?.teamVersion === 2) return a
          const old = seedAgents.find((s) => s.id === a.id)
          const team = teamFor(a.role)
          return { ...a, name: a.name === old?.name ? `${team.name} · ${a.role === 'reviewer' ? 'Reviewer' : team.title}` : a.name,
            ...(a.providerId === old?.providerId && a.modelId === old?.modelId ? { providerId: team.id, modelId: team.id === 'ollama' ? 'qwen2.5-coder:7b' : 'default', enabled: a.role === 'researcher' ? false : a.enabled } : {}) }
        })
        return { ...current, ...p, agents, providers: [...(p.providers ?? current.providers), ...(!((p.providers ?? current.providers).some((v) => v.id === 'deepseek')) ? [{ id: 'deepseek', name: 'DeepSeek', kind: 'openai-compatible' as const, endpoint: 'https://api.deepseek.com', local: false, status: 'unconfigured' as const, verified: false, models: [] }] : []), ...cliProviders.filter((c) => !(p.providers ?? current.providers).some((v) => v.id === c.id))], preferences: { ...current.preferences, ...p.preferences, teamVersion: 2, paidApisEnabled: false } }
      },
      onRehydrateStorage: () => () => useApp.setState({ hydrated: true }),
    },
  ),
)
