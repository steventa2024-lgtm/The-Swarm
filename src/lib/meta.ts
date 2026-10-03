import { Brain, FileText, FlaskConical, Palette, Search, ServerCog, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { AgentRole, RunMode, RunStatus, WorkerStatus } from '@/types'

export interface RoleMeta {
  label: string
  short: string
  icon: LucideIcon
  /** Tailwind-free color so it can be used in inline SVG / glows. */
  color: string
}

export const ROLE_META: Record<AgentRole, RoleMeta> = {
  planner:    { label: 'Planner',              short: 'Planner',  icon: Brain,        color: '#7aa8ff' },
  frontend:   { label: 'Frontend Builder',     short: 'Frontend', icon: Palette,      color: '#38bdf8' },
  backend:    { label: 'Backend Builder',      short: 'Backend',  icon: ServerCog,    color: '#3b82ff' },
  researcher: { label: 'Researcher',           short: 'Research', icon: Search,       color: '#22d3ee' },
  docs:       { label: 'Documentation Writer', short: 'Docs',     icon: FileText,     color: '#93c5fd' },
  qa:         { label: 'Tester / QA',          short: 'QA',       icon: FlaskConical, color: '#2dd4bf' },
  reviewer:   { label: 'Reviewer / Merger',    short: 'Reviewer', icon: ShieldCheck,  color: '#8aa4ff' },
}

export const MODE_META: Record<RunMode, { label: string; hint: string }> = {
  eco:           { label: 'Eco',          hint: 'Cheapest capable models' },
  balanced:      { label: 'Balanced',     hint: 'Each role\'s default model' },
  'max-quality': { label: 'Max Quality',  hint: 'Frontier models everywhere' },
  'local-only':  { label: 'Local Only',   hint: 'Nothing leaves this machine' },
  fastest:       { label: 'Fastest',      hint: 'Lowest-latency models' },
}

export type Tone = 'blue' | 'cyan' | 'success' | 'warning' | 'danger' | 'muted' | 'violet'

export const RUN_STATUS_META: Record<RunStatus, { label: string; tone: Tone; live: boolean }> = {
  idle:      { label: 'Ready',     tone: 'muted',   live: false },
  planning:  { label: 'Planning',  tone: 'cyan',    live: true },
  running:   { label: 'Running',   tone: 'blue',    live: true },
  reviewing: { label: 'Reviewing', tone: 'violet',  live: true },
  paused:    { label: 'Paused',    tone: 'warning', live: false },
  completed: { label: 'Completed', tone: 'success', live: false },
  stopped:   { label: 'Stopped',   tone: 'muted',   live: false },
  failed:    { label: 'Failed',    tone: 'danger',  live: false },
}

export const WORKER_STATUS_META: Record<WorkerStatus, { label: string; tone: Tone; live: boolean }> = {
  idle:    { label: 'Idle',    tone: 'muted',   live: false },
  queued:  { label: 'Queued',  tone: 'muted',   live: false },
  working: { label: 'Working', tone: 'blue',    live: true },
  waiting: { label: 'Waiting', tone: 'warning', live: false },
  done:    { label: 'Done',    tone: 'success', live: false },
  error:   { label: 'Error',   tone: 'danger',  live: false },
  paused:  { label: 'Paused',  tone: 'warning', live: false },
}

export const TONE_COLOR: Record<Tone, string> = {
  blue: '#4d9bff',
  cyan: '#22d3ee',
  success: '#2dd4bf',
  warning: '#fbbf24',
  danger: '#f87171',
  muted: '#7d8fb3',
  violet: '#8aa4ff',
}
