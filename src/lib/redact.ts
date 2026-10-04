/**
 * Masks secrets before anything is written to disk.
 *
 * Two levels, because the same text plays two roles:
 *  - 'strict' also masks `password = "…"`-style assignments. Right for logs and prompts, where a false
 *    positive costs nothing.
 *  - 'tokens' only masks unmistakable credentials (provider keys, private-key blocks). Right for the files
 *    the agents wrote, which are deliverables you may re-apply later: sample code containing
 *    `password = "changeme"` must not be silently altered.
 */

const MASK = '[REDACTED]'

const TOKENS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g, // OpenAI / Anthropic
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bAIza[0-9A-Za-z_-]{30,}/g, // Google
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g,
]

/** key = "value" / key: 'value' — keeps the key name so the context stays readable. */
const ASSIGNMENT = /\b((?:api[_-]?key|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|token|password|passwd)\s*[:=]\s*)(['"])[^'"\s]{8,}\2/gi

export function redact(text: string, level: 'strict' | 'tokens' = 'strict'): { text: string; count: number } {
  let count = 0
  let out = text
  for (const re of TOKENS) out = out.replace(re, () => { count++; return MASK })
  if (level === 'strict') out = out.replace(ASSIGNMENT, (_m, key: string, q: string) => { count++; return `${key}${q}${MASK}${q}` })
  return { text: out, count }
}

export const redactText = (text: string, level: 'strict' | 'tokens' = 'strict') => redact(text, level).text
