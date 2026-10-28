import { inTauri } from '@/providers/transport'

export type BotSlot = 'hq' | 'codex' | 'claude' | 'gemini' | 'cursor' | 'grok' | 'ollama'
export type TelegramBotStatus = 'not_configured' | 'credentials_saved' | 'verified' | 'listening' | 'offline' | 'error'
export interface BotPermissions { notifications: boolean; commands: boolean; approvals: boolean; testMessages: boolean }
export interface TelegramBotConfig { id: BotSlot; name: string; role: string; expectedUsername: string; permissions: BotPermissions; style: string }
export interface TelegramBot extends TelegramBotConfig {
  actualUsername: string | null; botId: number | null; status: TelegramBotStatus
  lastActivity: number | null; error: string | null; tokenPresent: boolean; transport: 'stopped' | 'polling'
}
export interface TelegramSettings {
  personalities: boolean; notifications: boolean; criticalAlerts: boolean; minIntervalSecs: number
  quietStart: number | null; quietEnd: number | null; reminders: boolean; reminderDelaySecs: number; maxReminders: number
}
export interface TelegramPairing { kind: 'owner' | 'group'; code: string; expiresAt: number; candidateUserId: number | null; candidateChatId: number | null }
export interface TelegramDelivery { id: string; botId: string; kind: string; status: 'queued' | 'sent' | 'received' | 'failed' | 'suppressed'; at: number; reference: string; error: string | null }
export interface TelegramApproval { id: string; runId: string; projectId: string; taskId: string; paths: string[]; expiresAt: number; status: string; risk: 'low' | 'high'; action: 'files' | 'probe' }
export interface TelegramDashboard {
  bots: TelegramBot[]; settings: TelegramSettings; pairing: TelegramPairing | null; ownerId: number | null
  privateChatId: number | null; groupChatId: number | null; deliveries: TelegramDelivery[]; pendingApprovals: TelegramApproval[]
}

const identities: Array<[BotSlot, string, string, string, string]> = [
  ['hq', 'Swarm Headquarters', 'hq', 'ZeroPulseSwarmHQBot', 'professional'],
  ['codex', 'Codex', 'planner', 'ZPSwarmCodexBot', 'strategic'],
  ['claude', 'Claude', 'backend', 'ZPSwarmClaudeBot', 'collaborative'],
  ['gemini', 'Gemini', 'frontend', 'ZPSwarmGeminiBot', 'creative'],
  ['cursor', 'Cursor', 'qa', 'ZPSwarmCursorBot', 'meticulous'],
  ['grok', 'Grok', 'researcher', 'ZPSwarmGrokBot', 'witty'],
  ['ollama', 'Ollama', 'docs', '', 'practical'],
]

/** Preview has identities only. Credential and connection evidence comes from native getMe/polling. */
export function emptyTelegramDashboard(): TelegramDashboard {
  return {
    bots: identities.map(([id, name, role, expectedUsername, style]) => ({
      id, name, role, expectedUsername, style,
      permissions: { notifications: true, commands: id === 'hq', approvals: id === 'hq', testMessages: true },
      actualUsername: null, botId: null, status: 'not_configured', lastActivity: null, error: null, tokenPresent: false, transport: 'stopped',
    })),
    settings: { personalities: false, notifications: true, criticalAlerts: true, minIntervalSecs: 30, quietStart: null, quietEnd: null, reminders: false, reminderDelaySecs: 900, maxReminders: 1 },
    pairing: null, ownerId: null, privateChatId: null, groupChatId: null, deliveries: [], pendingApprovals: [],
  }
}

export async function telegramInvoke<T = void>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!inTauri()) throw new Error('Open The Swarm desktop app to configure Telegram bots securely.')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export const TELEGRAM_STATUS_LABELS: Record<TelegramBotStatus, string> = {
  not_configured: 'Not configured', credentials_saved: 'Credentials saved', verified: 'Verified', listening: 'Connected and listening', offline: 'Offline', error: 'Error',
}
