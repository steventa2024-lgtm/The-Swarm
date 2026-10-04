import { create } from 'zustand'
import type { DriverContext, RunController } from '@/engine/driver'
import { liveDriver } from '@/engine/liveDriver'
import { relevantNotes } from '@/engine/notes'
import { simulatedDriver } from '@/engine/simulator'
import type { Run, RunMode, RunStatus, Template } from '@/types'
import { useApp } from './app'


export const DEMO_PROMPT = 'Build authentication with Google OAuth'

let controller: RunController | null = null
const TERMINAL: RunStatus[] = ['completed', 'stopped', 'failed']

interface SwarmState {
  run: Run | null
  prompt: string
  mode: RunMode
  agentCount: 'auto' | 2 | 3 | 4
  attachments: string[]
  selectedId: string | null
  applyOpen: boolean

  setApplyOpen: (open: boolean) => void
  /** Adds (or updates) a real check result on the final output. */
  recordCheck: (label: string, passed: boolean) => void
  /** Puts a prepared prompt in the task box and returns to the Swarm view. */
  prepareFix: (prompt: string) => void
  select: (id: string | null) => void
  setPrompt: (p: string) => void
  setMode: (m: RunMode) => void
  setAgentCount: (n: 'auto' | 2 | 3 | 4) => void
  addAttachment: (name: string) => void
  removeAttachment: (name: string) => void
  loadTemplate: (t: Template) => void

  start: (opts?: { prompt?: string; warmupMs?: number; record?: boolean }) => void
  pause: () => void
  resume: () => void
  stop: () => void
  reset: () => void
}

export const useSwarm = create<SwarmState>()((set, get) => ({
  run: null,
  prompt: '',
  mode: useApp.getState().preferences.defaultMode,
  agentCount: useApp.getState().preferences.defaultAgentCount,
  attachments: [],
  selectedId: null,
  applyOpen: false,

  setApplyOpen: (applyOpen) => set({ applyOpen }),
  recordCheck: (label, passed) =>
    set((s) => {
      const out = s.run?.finalOutput
      if (!s.run || !out) return s
      const checks = [...out.checks.filter((c) => c.label !== label), { label, passed }]
      return { run: { ...s.run, finalOutput: { ...out, checks } } }
    }),
  prepareFix: (prompt) => {
    useApp.getState().setView('graph')
    set({ prompt, applyOpen: false })
  },
  select: (selectedId) => set({ selectedId }),
  setPrompt: (prompt) => set({ prompt }),
  setMode: (mode) => set({ mode }),
  setAgentCount: (agentCount) => set({ agentCount }),
  addAttachment: (name) => set((s) => (s.attachments.includes(name) ? s : { attachments: [...s.attachments, name] })),
  removeAttachment: (name) => set((s) => ({ attachments: s.attachments.filter((a) => a !== name) })),
  loadTemplate: (t) => set({ prompt: t.prompt, mode: t.mode, agentCount: t.agents }),

  start: (opts) => {
    const s = get()
    const prompt = (opts?.prompt ?? s.prompt).trim()
    if (!prompt) return
    controller?.stop() // records a live run as stopped before replacing it
    controller?.dispose()

    const app = useApp.getState()
    // The launch demo is always simulated; everything else follows the Orchestrator preference.
    const live = app.preferences.orchestrator === 'live' && opts?.warmupMs === undefined
    const driver = live ? liveDriver : simulatedDriver
    const project = app.projects.find((p) => p.id === app.activeProjectId)
    // Only notes that relate to this request go along; unrelated ones mislead the plan and cost tokens.
    const notes = relevantNotes(app.memory.filter((m) => m.projectId === app.activeProjectId), prompt)
      .map((m) => `- ${m.title}: ${m.body}`)
      .join('\n')
      .slice(0, 2400)
    const ctx: DriverContext = {
      providers: live ? app.providers.filter((p) => p.verified && p.status === 'connected') : app.providers,
      projectName: project?.name,
      projectRoot: live ? project?.root : undefined,
      projectNotes: live && notes ? notes : undefined,
      agents: app.agents,
      maxWorkers: app.preferences.maxConcurrency,
      getSpeed: () => useApp.getState().preferences.simulationSpeed,
      warmupMs: opts?.warmupMs,
    }
    let prevStatus: RunStatus | null = null
    controller = driver.start(
      { prompt, projectId: app.activeProjectId, mode: s.mode, requestedAgents: s.agentCount, attachments: s.attachments },
      ctx,
      (run) => {
        set({ run })
        if (opts?.record !== false && TERMINAL.includes(run.status) && prevStatus && !TERMINAL.includes(prevStatus)) {
          useApp.getState().pushHistory({
            id: run.id, title: run.task.title, projectId: run.task.projectId, mode: run.task.mode,
            status: run.status, agentCount: run.workers.length - 2, durationMs: run.elapsedMs,
            tokens: run.metrics.tokensIn + run.metrics.tokensOut, costUsd: run.metrics.costUsd,
            startedAt: run.startedAt,
          })
        }
        prevStatus = run.status
      },
    )
    set({ prompt: '', selectedId: null, applyOpen: false })
  },
  pause: () => controller?.pause(),
  resume: () => controller?.resume(),
  stop: () => controller?.stop(),
  reset: () => {
    controller?.dispose()
    controller = null
    set({ run: null, selectedId: null, applyOpen: false })
  },
}))
