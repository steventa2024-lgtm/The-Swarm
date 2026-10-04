/* Domain model for ZeroPulse Swarm. The UI only talks to these types, so a real
   orchestration backend can replace the simulator without touching components. */

// ───────────────────────── Providers & models ─────────────────────────

export type ProviderKind =
  | 'openai-compatible'
  | 'anthropic'
  | 'openrouter'
  | 'ollama'
  | 'llamacpp'

export type ModelTier = 'frontier' | 'balanced' | 'fast' | 'local'

export interface ModelInfo {
  id: string
  label: string
  tier: ModelTier
  contextWindow: number
  /** USD per 1M tokens. Estimates the user can edit; local models are 0. */
  inputCostPer1M: number
  outputCostPer1M: number
  /** Relative generation speed, used by the simulator and "Fastest" routing. */
  tokensPerSecond: number
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'unconfigured'

export interface Provider {
  id: string
  name: string
  kind: ProviderKind
  endpoint: string
  local: boolean
  status: ConnectionStatus
  /** Env var / keychain label only. Secrets never live in app state. */
  credentialRef?: string
  /** True once a live connection test succeeded. Live runs only route to verified providers. */
  verified?: boolean
  models: ModelInfo[]
}

// ───────────────────────── Agents ─────────────────────────

export type AgentRole =
  | 'planner'
  | 'frontend'
  | 'backend'
  | 'researcher'
  | 'docs'
  | 'qa'
  | 'reviewer'

export interface AgentDefinition {
  id: string
  role: AgentRole
  name: string
  description: string
  enabled: boolean
  providerId: string
  modelId: string
  capabilities: string[]
  /** The agent's standing instructions. Falls back to the built-in skill for its role. */
  skill?: string
  /** Why auto-assign picked this model (shown in the Agents page). */
  reason?: string
  /** Roles that can be disabled by the user. Planner/reviewer are core. */
  core?: boolean
}

export type WorkerStatus =
  | 'idle'
  | 'queued'
  | 'working'
  | 'waiting'
  | 'done'
  | 'error'
  | 'paused'

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
}

/** A live agent instance inside a run. */
export interface Worker {
  id: string
  agentId: string
  role: AgentRole
  name: string
  providerId: string
  modelId: string
  modelLabel: string
  status: WorkerStatus
  progress: number // 0-100
  subtaskId?: string
  summary: string
  /** The slice of the master prompt the planner handed this worker (live runs). */
  brief?: string
  recentAction: string
  activeFiles: string[]
  additions: number
  deletions: number
  tokensIn: number
  tokensOut: number
  elapsedMs: number
  startedAt?: number // ms offset from run start
  endedAt?: number
  checklist: ChecklistItem[]
}

// ───────────────────────── Tasks & runs ─────────────────────────

export type RunMode = 'eco' | 'balanced' | 'max-quality' | 'local-only' | 'fastest'
export type Complexity = 'low' | 'medium' | 'high'

export interface Task {
  id: string
  title: string
  prompt: string
  projectId: string
  mode: RunMode
  /** 'auto' lets the orchestrator decide. */
  requestedAgents: 'auto' | 2 | 3 | 4
  complexity: Complexity
  attachments: string[]
}

export type SubtaskStatus = 'pending' | 'active' | 'done' | 'blocked'

export interface Subtask {
  id: string
  title: string
  description: string
  role: AgentRole
  status: SubtaskStatus
  dependsOn: string[]
}

export type RunStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'reviewing'
  | 'paused'
  | 'completed'
  | 'stopped'
  | 'failed'

export type ActivityKind = 'system' | 'plan' | 'code' | 'review' | 'test' | 'info' | 'success' | 'warning'

export interface ActivityEvent {
  id: string
  at: number // ms offset from run start
  kind: ActivityKind
  workerId?: string
  role?: AgentRole
  message: string
}

export type FileChangeType = 'added' | 'modified' | 'deleted'

export interface FileChange {
  path: string
  type: FileChangeType
  additions: number
  deletions: number
  workerId: string
  role: AgentRole
  /** Full proposed contents (live runs). Nothing is written until the user applies it. */
  content?: string
}

export interface TimelineEntry {
  id: string
  label: string
  at: number
  status: 'done' | 'active' | 'pending'
}

export interface ProviderUsage {
  providerId: string
  tokens: number
  cost: number
}

export interface Metrics {
  tokensIn: number
  tokensOut: number
  costUsd: number
  throughput: number // tokens / second (rolling)
  tokenSeries: number[] // cumulative samples for sparkline
  costSeries: number[]
  throughputSeries: number[]
  byProvider: ProviderUsage[]
  filesChanged: number
  additions: number
  deletions: number
}

export interface FinalOutput {
  headline: string
  summary: string[]
  filesChanged: number
  additions: number
  deletions: number
  checks: { label: string; passed: boolean }[]
  nextSteps: string[]
}

export interface Run {
  id: string
  task: Task
  status: RunStatus
  subtasks: Subtask[]
  workers: Worker[]
  events: ActivityEvent[]
  fileChanges: FileChange[]
  timeline: TimelineEntry[]
  metrics: Metrics
  startedAt: number // epoch ms
  elapsedMs: number
  finalOutput?: FinalOutput
}

/** Compact record kept in history after a run finishes. */
export interface RunSummary {
  id: string
  title: string
  projectId: string
  mode: RunMode
  status: RunStatus
  agentCount: number
  durationMs: number
  tokens: number
  /** Tokens sent to paid (non-local) providers. Absent on older entries. */
  paidTokens?: number
  costUsd: number
  startedAt: number
  /** Simulated and sample runs never count toward the token budget. */
  simulated?: boolean
}

// ───────────────────────── Workspace content ─────────────────────────

export interface Project {
  id: string
  name: string
  path: string
  stack: string[]
  status: 'healthy' | 'attention' | 'archived'
  branch: string
  /** Absolute folder chosen with the native picker (desktop only). Workers may only touch files inside it. */
  root?: string
  lastRunAt?: number
  runCount: number
  description: string
}

export type MemoryKind = 'note' | 'decision' | 'doc' | 'repo-summary'

export interface ProjectMemory {
  id: string
  projectId: string
  kind: MemoryKind
  title: string
  body: string
  tags: string[]
  updatedAt: number
  /** Number of runs that pulled this entry into context. */
  uses: number
}

export interface Template {
  id: string
  name: string
  description: string
  prompt: string
  mode: RunMode
  agents: 'auto' | 2 | 3 | 4
  icon: 'feature' | 'bug' | 'refactor' | 'tests' | 'docs' | 'research'
  builtin?: boolean
}

export interface Integration {
  id: string
  name: string
  description: string
  category: 'provider' | 'source-control' | 'local' | 'filesystem' | 'future'
  status: ConnectionStatus | 'planned'
  detail?: string
}

export interface Preferences {
  tokenBudgetMode: 'strict' | 'balanced' | 'unlimited'
  tokenBudget: number
  maxConcurrency: number
  defaultAgentCount: 'auto' | 2 | 3 | 4
  defaultMode: RunMode
  reduceMotion: boolean
  telemetry: boolean
  storeRunLogs: boolean
  redactSecrets: boolean
  simulationSpeed: 1 | 2 | 4
  /** 'simulated' plays a scripted demo; 'live' calls verified providers. */
  orchestrator: 'simulated' | 'live'
}

export type PageId =
  | 'swarm'
  | 'projects'
  | 'agents'
  | 'knowledge'
  | 'templates'
  | 'integrations'
  | 'settings'
  | 'support'

export type SwarmView = 'graph' | 'timeline' | 'preview'
