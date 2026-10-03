import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  seedAgents, seedHistory, seedIntegrations, seedMemory, seedPreferences, seedProjects,
  seedProviders, seedTemplates,
} from '@/data/seed'
import { appStorage } from '@/persistence/storage'
import { uid } from '@/lib/utils'
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
  updatePreferences: (patch: Partial<Preferences>) => void
  addTemplate: (t: Omit<Template, 'id'>) => void
  deleteTemplate: (id: string) => void
  addMemory: (m: Omit<ProjectMemory, 'id' | 'updatedAt' | 'uses'>) => void
  deleteMemory: (id: string) => void
  pushHistory: (r: RunSummary) => void
  resetData: () => void
}

const seeds = () => ({
  activeProjectId: seedProjects[0].id,
  providers: seedProviders,
  agents: seedAgents,
  projects: seedProjects,
  memory: seedMemory,
  templates: seedTemplates,
  integrations: seedIntegrations,
  history: seedHistory,
  preferences: seedPreferences,
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
      updatePreferences: (patch) => set((s) => ({ preferences: { ...s.preferences, ...patch } })),
      addTemplate: (t) => set((s) => ({ templates: [{ ...t, id: uid('tpl') }, ...s.templates] })),
      deleteTemplate: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
      addMemory: (m) =>
        set((s) => ({ memory: [{ ...m, id: uid('mem'), updatedAt: Date.now(), uses: 0 }, ...s.memory] })),
      deleteMemory: (id) => set((s) => ({ memory: s.memory.filter((m) => m.id !== id) })),
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
      name: 'zeropulse-swarm/v1',
      storage: createJSONStorage(() => appStorage),
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
        return { ...current, ...p, preferences: { ...current.preferences, ...p.preferences } }
      },
      onRehydrateStorage: () => () => useApp.setState({ hydrated: true }),
    },
  ),
)
