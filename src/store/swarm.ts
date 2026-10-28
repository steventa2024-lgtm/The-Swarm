import { DEFAULT_MODEL_POLICY } from '@/engine/modelPolicy'
import { create } from 'zustand'
import type { DriverContext, RunController } from '@/engine/driver'
import { failImmediately, liveDriver } from '@/engine/liveDriver'
import { LocalOnlyError } from '@/engine/routing'
import { relevantNotes } from '@/engine/notes'
import { paidTokens, usedLast24h } from '@/lib/budget'
import { simulatedDriver } from '@/engine/simulator'
import { saveRun } from '@/persistence/runStore'
import { MAX_ATTACHMENTS } from '@/lib/attachments'
import type { Attachment, Run, RunMode, RunStatus, Template } from '@/types'
import { useApp } from './app'
import { recordFrame, recoverFlight, listFlights } from '@/persistence/flightRecorder'
import { seedAgents, seedProviders } from '@/data/seed'
import { skillFor } from '@/data/skills'
import { teamFor } from '@/data/team'


export const DEMO_PROMPT = 'Build a tiny static page for The Swarm. Assign frontend to create index.html with a heading and a stylesheet link, backend to create styles.css with an accessible dark theme. Both roles must work, own different files, and have no dependencies. Keep each file under 30 lines. Reviewer: inspect the two files. Never apply files.'

let controller: RunController | null = null
const projectControllers = new Map<string, RunController>()
const TERMINAL: RunStatus[] = ['completed', 'stopped', 'failed']

interface SwarmState {
  projectRuns: Record<string, Run>
  activateProject: (id: string) => void
  run: Run | null
  prompt: string
  mode: RunMode
  agentCount: 'auto' | 2 | 3 | 4
  attachments: Attachment[]
  selectedId: string | null
  applyOpen: boolean
  reviewApprovalId: string | null
  /** True when the current run calls real providers (so its tokens count toward the budget). */
  runIsLive: boolean
  replaying: boolean
  recorderError: string | null
  recover: () => Promise<void>

  setApplyOpen: (open: boolean) => void
  openApproval: (id: string) => void
  /** Shows a previously saved run (read-only history). Ignored while a run is in progress. */
  openRun: (run: Run, replay?: boolean) => boolean
  /** Adds (or updates) a real check result on the final output. */
  recordCheck: (label: string, passed: boolean) => void
  recordOwnerDecision: (runId: string, revision: string, status: string, channel: string) => void
  /** Puts a prepared prompt in the task box and returns to the Swarm view. */
  prepareFix: (prompt: string) => void
  select: (id: string | null) => void
  setPrompt: (p: string) => void
  setMode: (m: RunMode) => void
  setAgentCount: (n: 'auto' | 2 | 3 | 4) => void
  addAttachment: (a: Attachment) => void
  removeAttachment: (name: string) => void
  loadTemplate: (t: Template) => void

  start: (opts?: { prompt?: string; warmupMs?: number; record?: boolean; localDemo?: boolean }) => void
  pause: () => void
  resume: () => void
  stop: () => void
  reset: () => void
}

export const useSwarm = create<SwarmState>()((set, get) => ({
  projectRuns: {},
  activateProject: (id) => { controller = projectControllers.get(id) ?? null; const run = get().projectRuns[id] ?? null; set({ run, runIsLive: !!controller && run?.source === 'live', replaying: false, selectedId: null, applyOpen: false, reviewApprovalId: null }) },
  run: null,
  prompt: '',
  mode: useApp.getState().preferences.defaultMode,
  agentCount: useApp.getState().preferences.defaultAgentCount,
  attachments: [],
  selectedId: null,
  applyOpen: false,
  reviewApprovalId: null,
  runIsLive: false,
  replaying: false,
  recorderError: null,
  recover: async () => {
    const ids = await listFlights()
    const recovered = await Promise.all(ids.slice(0, 20).map((id) => recoverFlight(id)))
    const projectRuns: Record<string, Run> = {}
    for (const run of recovered) if (run && !projectRuns[run.task.projectId]) projectRuns[run.task.projectId] = run
    if (!get().run && Object.keys(projectRuns).length) set({ projectRuns, run: projectRuns[useApp.getState().activeProjectId] ?? Object.values(projectRuns)[0], replaying: true })
  },

  setApplyOpen: (applyOpen) => set({ applyOpen, reviewApprovalId: null }),
  openApproval: (reviewApprovalId) => set({ reviewApprovalId, applyOpen: true }),
  openRun: (run, replay = false) => {
    const cur = get().run
    if (!get().replaying && cur && ['planning', 'running', 'reviewing', 'paused'].includes(cur.status)) return false
    controller?.dispose()
    controller = null
    set({ run, runIsLive: false, replaying: replay, selectedId: null, applyOpen: false, reviewApprovalId: null })
    return true
  },
  recordCheck: (label, passed) =>
    set((s) => {
      const out = s.run?.finalOutput
      if (!s.run || !out) return s
      const checks = [...out.checks.filter((c) => c.label !== label), { label, passed }]
      const run = { ...s.run, finalOutput: { ...out, checks }, events: [{ id: crypto.randomUUID(), at: Date.now() - s.run.startedAt, kind: 'test' as const, taskId: s.run.task.id, toolRunId: crypto.randomUUID(), message: `${label}: ${passed ? 'passed' : 'failed'}` }, ...s.run.events] }
      if (useApp.getState().preferences.storeRunLogs) void recordFrame(run).catch(() => set({ recorderError: 'Flight recorder could not save. Check local storage space.' }))
      return { run }
    }),
  recordOwnerDecision: (runId, revision, status, channel) => set((s) => {
    if (!s.run || s.run.id !== runId) return s
    const run = { ...s.run, ownerDecision: { status, revision, channel }, events: [{ id: crypto.randomUUID(), at: Date.now() - s.run.startedAt, kind: 'system' as const, taskId: s.run.task.id, message: `Zero via ${channel}: ${status} · revision ${revision}` }, ...s.run.events] }
    if (useApp.getState().preferences.storeRunLogs) void recordFrame(run).catch(() => set({ recorderError: 'Flight recorder could not save. Check local storage space.' }))
    return { run }
  }),
  prepareFix: (prompt) => {
    useApp.getState().setView('graph')
    set({ prompt, applyOpen: false })
  },
  select: (selectedId) => set({ selectedId }),
  setPrompt: (prompt) => set({ prompt }),
  setMode: (mode) => set({ mode }),
  setAgentCount: (agentCount) => set({ agentCount }),
  addAttachment: (a) => set((s) => ({ attachments: [...s.attachments.filter((x) => x.name !== a.name), a].slice(-MAX_ATTACHMENTS) })),
  removeAttachment: (name) => set((s) => ({ attachments: s.attachments.filter((a) => a.name !== name) })),
  loadTemplate: (t) => set({ prompt: t.prompt, mode: t.mode, agentCount: t.agents }),

  start: (opts) => {
    const s = get()
    const prompt = (opts?.prompt ?? s.prompt).trim()
    if (!prompt) return
    const appBefore = useApp.getState()
    const running = Object.values(s.projectRuns).filter((r) => !TERMINAL.includes(r.status))
    if (running.some((r) => r.task.projectId === appBefore.activeProjectId)) { set({ recorderError: 'This project already has active work. Pause or stop it before starting another task.' }); return }
    if (running.length >= 2) { set({ recorderError: 'Two project workflows are already active. Wait for a project slot.' }); return }
    const root = appBefore.projects.find((p) => p.id === appBefore.activeProjectId)?.root
    if (running.length && (!root || running.some((r) => appBefore.projects.find((p) => p.id === r.task.projectId)?.root === root))) { set({ recorderError: 'Parallel projects require distinct approved roots to avoid conflicting work.' }); return }
    controller?.dispose()

    const app = useApp.getState()
    // The launch demo is always simulated; everything else follows the Orchestrator preference.
    const live = (opts?.localDemo || app.preferences.orchestrator === 'live') && opts?.warmupMs === undefined
    const driver = live ? liveDriver : simulatedDriver
    const project = app.projects.find((p) => p.id === app.activeProjectId)
    // Only notes that relate to this request go along; unrelated ones mislead the plan and cost tokens.
    const picked = relevantNotes(app.memory.filter((m) => m.projectId === app.activeProjectId), prompt)
    const notes = picked.map((m) => `- ${m.title}: ${m.body}`).join('\n').slice(0, 2400)
    // Count a note as used only when it is really sent to a model (live runs).
    if (live && notes) app.noteUsed(picked.map((m) => m.id))
    const ctx: DriverContext = {
      providers: live ? app.providers.filter((p) => p.verified && p.status === 'connected' && (p.local || p.subscription || p.id === 'deepseek')) : seedProviders,
      modelPolicy: live && !opts?.localDemo ? { ...DEFAULT_MODEL_POLICY, ...app.preferences.modelPolicy } : undefined,
      projectName: project?.name,
      projectRoot: live ? project?.root : undefined,
      projectNotes: live && notes ? notes : undefined,
      agents: !live ? seedAgents : opts?.localDemo ? app.agents.map((a) => ({ ...a, name: `Ollama · ${a.role}`, enabled: ['planner', 'frontend', 'backend', 'reviewer'].includes(a.role) })) : app.agents.map((a) => ({ ...a, skill: app.preferences.personalities ? `${skillFor(a.role, a.skill)}\nPersonality (style only; no authority): ${teamFor(a.role).personality}` : a.skill })),
      maxWorkers: app.preferences.maxConcurrency,
      getSpeed: () => useApp.getState().preferences.simulationSpeed,
      warmupMs: opts?.warmupMs,
      budget: live
        ? { mode: app.preferences.tokenBudgetMode, limit: app.preferences.tokenBudget, usedBefore: usedLast24h(app.history) }
        : undefined,
    }
    let prevStatus: RunStatus | null = null
    const request = { prompt, projectId: app.activeProjectId, mode: opts?.localDemo ? 'local-only' as const : s.mode, requestedAgents: opts?.localDemo ? 2 as const : s.agentCount, attachments: s.attachments.map((a) => a.name), attachmentFiles: live ? s.attachments : undefined }
    const onUpdate = (run: Run) => {
        set((state) => ({ projectRuns: { ...state.projectRuns, [run.task.projectId]: run }, ...(useApp.getState().activeProjectId === run.task.projectId ? { run } : {}) }))
        if (live && useApp.getState().preferences.storeRunLogs) void recordFrame(run).catch(() => set({ recorderError: 'Flight recorder could not save. Check local storage space.' }))
        if (opts?.record !== false && TERMINAL.includes(run.status) && prevStatus && !TERMINAL.includes(prevStatus)) {
          // Keep the full result (files, events) so it can be reopened later — only if the user hasn't turned that off.
          const prefs = useApp.getState().preferences
          if (live && prefs.storeRunLogs) void saveRun(run, { redact: prefs.redactSecrets }).catch((e) => console.warn('[ZeroPulse] could not save run', e))
          useApp.getState().pushHistory({
            id: run.id, title: run.task.title, projectId: run.task.projectId, mode: run.task.mode,
            status: run.status, agentCount: run.workers.length - 2, durationMs: run.elapsedMs,
            tokens: run.metrics.tokensIn + run.metrics.tokensOut, costUsd: run.metrics.costUsd,
            paidTokens: paidTokens(run.metrics, app.providers), simulated: !live,
            startedAt: run.startedAt,
          })
        }
        prevStatus = run.status
    }
    try {
      controller = driver.start(request, ctx, onUpdate)
    } catch (e) {
      // Local Only with no local model: show a failed run that says why, rather than quietly using a hosted model.
      controller = failImmediately(request, ctx, onUpdate, e instanceof Error ? e.message : String(e), e instanceof LocalOnlyError ? 'No local model' : 'Provider unavailable')
    }
    if (controller) projectControllers.set(app.activeProjectId, controller)
    // Attachments are per-run: clearing them avoids re-sending a file to a provider by accident on the next run.
    set({ prompt: '', attachments: [], selectedId: null, applyOpen: false, runIsLive: !!live, replaying: false, recorderError: null })
  },
  pause: () => controller?.pause(),
  resume: () => controller?.resume(),
  stop: () => controller?.stop(),
  reset: () => {
    controller?.dispose()
    controller = null
    projectControllers.delete(useApp.getState().activeProjectId)
    const projectRuns = { ...get().projectRuns }; delete projectRuns[useApp.getState().activeProjectId]
    set({ projectRuns, run: null, selectedId: null, applyOpen: false, reviewApprovalId: null, replaying: false, runIsLive: false })
  },
}))
