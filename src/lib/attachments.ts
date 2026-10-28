import type { Attachment } from '@/types'
import { redact } from './redact'

/**
 * Reference files the user attaches to a task. Only the planner reads them (it copies what each agent needs
 * into that agent's brief), which keeps the extra tokens to a single call.
 */

export const MAX_ATTACHMENTS = 5
/** Characters kept per file. Larger files are cut and flagged. */
export const MAX_FILE_CHARS = 60_000
/** Total characters sent across all attachments. */
export const MAX_TOTAL_CHARS = 120_000
/** Larger than this is refused outright (reading it would stall the UI for nothing). */
const MAX_FILE_BYTES = 2_000_000

export const approxTokens = (chars: number) => Math.ceil(chars / 4)

/** Text files have no NUL bytes and almost no replacement characters. */
export function looksBinary(text: string): boolean {
  if (text.includes('\0')) return true
  const sample = text.slice(0, 8000)
  const bad = (sample.match(/�/g) ?? []).length
  return sample.length > 0 && bad / sample.length > 0.02
}

export type ReadResult = { ok: true; attachment: Attachment } | { ok: false; reason: string }

export async function readAttachment(file: { name: string; size: number; text: () => Promise<string> }): Promise<ReadResult> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, reason: `${file.name} is too large (over ${MAX_FILE_BYTES / 1_000_000} MB).` }
  let text: string
  try { text = await file.text() } catch { return { ok: false, reason: `${file.name} could not be read.` } }
  if (looksBinary(text)) return { ok: false, reason: `${file.name} isn't a text file. Attach source, notes or docs.` }
  const truncated = text.length > MAX_FILE_CHARS
  const content = truncated ? text.slice(0, MAX_FILE_CHARS) : text
  return {
    ok: true,
    attachment: { name: file.name, content, truncated, tokens: approxTokens(content.length), secrets: redact(content, 'tokens').count },
  }
}

/** Renders attachments for the planner prompt, within a character budget. Returns '' when there are none. */
export function renderAttachments(files: Attachment[], maxChars = MAX_TOTAL_CHARS): string {
  if (files.length === 0) return ''
  let left = maxChars
  const parts: string[] = []
  for (const f of files) {
    if (left <= 0) { parts.push(`--- ${f.name} (omitted: attachment size limit reached) ---`); continue }
    const body = f.content.length > left ? f.content.slice(0, left) : f.content
    left -= body.length
    parts.push(`--- ${f.name}${f.truncated || body.length < f.content.length ? ' (truncated)' : ''} ---\n${body}`)
  }
  return (
    '\n\nAttached reference files from the user. The workers will NOT see these: copy whatever each agent needs into its brief or spec.\n' +
    parts.join('\n\n')
  )
}
