import { describe, expect, it } from 'vitest'
import { redact, redactText } from '@/lib/redact'

describe('redact — provider keys and tokens (both levels)', () => {
  const secrets = [
    'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789',
    'sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345',
    'sk-abcdefghijklmnopqrstuvwxyz123456',
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz',
    'AKIAIOSFODNN7EXAMPLE',
    'AIzaSyA-abcdefghijklmnopqrstuvwxyz012345',
    'xoxb-1234567890-abcdefghij',
    'Bearer eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnop',
  ]
  it.each(secrets)('masks %s', (s) => {
    for (const level of ['strict', 'tokens'] as const) {
      const r = redact(`before ${s} after`, level)
      expect(r.text).toBe('before [REDACTED] after')
      expect(r.count).toBe(1)
    }
  })

  it('masks a whole private key block', () => {
    const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nabc\n-----END RSA PRIVATE KEY-----'
    expect(redactText(`k:\n${key}\nend`, 'tokens')).toBe('k:\n[REDACTED]\nend')
  })

  it('masks several secrets in one text and counts them', () => {
    const r = redact('a sk-abcdefghijklmnopqrstuvwxyz123456 b ghp_abcdefghijklmnopqrstuvwxyz0123456789')
    expect(r.count).toBe(2)
    expect(r.text).not.toMatch(/sk-|ghp_/)
  })
})

describe('redact — strict vs tokens level', () => {
  const code = 'const config = { password: "hunter2hunter2", api_key = "abcd1234efgh" }'
  it('strict masks key/value assignments but keeps the key name', () => {
    const t = redactText(code, 'strict')
    expect(t).toContain('password: "[REDACTED]"')
    expect(t).toContain('api_key = "[REDACTED]"')
    expect(t).not.toContain('hunter2')
  })
  it('tokens level leaves ordinary code untouched (files are deliverables)', () => {
    expect(redactText(code, 'tokens')).toBe(code)
  })
})

describe('redact — does not damage normal text', () => {
  it.each([
    'The token budget is 400000 tokens',
    'Use a password manager; never commit a secret',
    'const sk = 5; // sk- is a prefix',
    'skeleton-key-of-the-matter',
    'password: "short"', // too short to be a real secret
    'git push origin main',
  ])('leaves %j alone', (t) => {
    expect(redact(t).count).toBe(0)
    expect(redactText(t)).toBe(t)
  })
  it('handles empty input', () => expect(redact('')).toEqual({ text: '', count: 0 }))
})
