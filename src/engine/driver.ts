import type { AgentDefinition, Provider, RunMode, Run } from '@/types'

/** Everything the UI knows about a run before it starts. */
export interface RunRequest {
  prompt: string
  projectId: string
  mode: RunMode
  requestedAgents: 'auto' | 2 | 3 | 4
  attachments: string[]
}

export interface DriverContext {
  providers: Provider[]
  agents: AgentDefinition[]
  /** Max parallel workers allowed by preferences. */
  maxWorkers: number
  /** Playback speed. Only meaningful for the simulator. */
  getSpeed: () => number
  /** Simulator only: pre-advance this many ms before the first emit. */
  warmupMs?: number
  /** Live driver: project memory rendered as text for prompts. */
  projectNotes?: string
  projectName?: string
  /** Approved project folder; lets the live driver read the file tree and existing files. */
  projectRoot?: string
}

export interface RunController {
  pause(): void
  resume(): void
  stop(): void
  /** Release timers/sockets. Must be safe to call more than once. */
  dispose(): void
}

/**
 * The seam between UI and orchestration. The simulator below implements it
 * today; a real engine (Tauri sidecar, HTTP service, etc.) only has to emit
 * full `Run` snapshots through `onUpdate` and honour the controller.
 */
export interface OrchestratorDriver {
  start(req: RunRequest, ctx: DriverContext, onUpdate: (run: Run) => void): RunController
}
