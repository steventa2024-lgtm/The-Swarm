import { it, expect } from 'vitest'
import { artifactLink } from '@/lib/artifactLinks'
it('never advertises localhost as a mobile preview or unapproved remote publishing', () => {
  expect(artifactLink('http://localhost:1234/preview').mobile).toBe(false)
  expect(artifactLink('https://private.example/').usable).toBe(false)
  expect(artifactLink('https://user:password@example.com', true).usable).toBe(false)
  expect(artifactLink('javascript:alert(1)', true).usable).toBe(false)
})
