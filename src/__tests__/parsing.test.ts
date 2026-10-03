import { describe, expect, it } from 'vitest'
import { collapse, diffLines } from '@/lib/diff'
import { cleanPath } from '@/lib/fsBridge'
import { extractJson, parseFiles } from '@/engine/liveDriver'

describe('extractJson', () => {
  it('reads plain JSON', () => expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 }))
  it('strips code fences and chatter', () => {
    expect(extractJson<{ a: number }>('Sure!\n```json\n{"a": 2}\n```\nDone')).toEqual({ a: 2 })
  })
  it('ignores <think> blocks from reasoning models', () => {
    expect(extractJson<{ ok: boolean }>('<think>maybe {"ok": false}</think>{"ok": true}')).toEqual({ ok: true })
  })
  it('returns null on garbage', () => expect(extractJson('no json here')).toBeNull())
})

describe('parseFiles', () => {
  const text = 'Summary here.\n\n### FILE: src/a.ts\n```ts\nconst a = 1\n\nexport { a }\n```\n\n### FILE: `src/b.css`\n```css\nbody { margin: 0 }\n```\n'
  it('extracts every file with content and line counts', () => {
    const files = parseFiles(text)
    expect(files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.css'])
    expect(files[0].content).toBe('const a = 1\n\nexport { a }\n')
    expect(files[0].lines).toBe(2) // blank lines don't count
  })
  it('handles a file that is still streaming (no closing fence)', () => {
    const files = parseFiles('### FILE: x.js\n```js\nlet x = 1')
    expect(files).toHaveLength(1)
    expect(files[0].content).toContain('let x = 1')
  })
  it('ignores headers with no code block', () => expect(parseFiles('### FILE: nothing.ts\n')).toEqual([]))
})

describe('parseFiles — models that ignore the header format', () => {
  it('names a bare ```html block index.html and css/js by language', () => {
    const t = 'Here is the app:\n```html\n<!doctype html><h1>Hi</h1>\n```\nStyles:\n```css\nbody{margin:0}\n```\n```javascript\nconsole.log(1)\n```'
    expect(parseFiles(t).map((f) => f.path)).toEqual(['index.html', 'styles.css', 'app.js'])
  })
  it('takes the name from the line above the fence', () => {
    const t = '**src/utils/math.js**\n```js\nexport const add = (a, b) => a + b\n```'
    expect(parseFiles(t).map((f) => f.path)).toEqual(['src/utils/math.js'])
  })
  it('takes the name from the fence info string', () => {
    expect(parseFiles('```js server.js\nlisten()\n```').map((f) => f.path)).toEqual(['server.js'])
  })
  it('takes the name from a leading comment', () => {
    expect(parseFiles('```js\n// file: lib/a.js\nexport {}\n```').map((f) => f.path)).toEqual(['lib/a.js'])
  })
  it('ignores json/shell blocks and explanations', () => {
    expect(parseFiles('Run this:\n```bash\nnpm i\n```\nConfig:\n```json\n{"a":1}\n```')).toEqual([])
  })
  it('prefers explicit FILE headers when present', () => {
    const t = '### FILE: a.ts\n```ts\nx\n```\n```html\n<p>stray</p>\n```'
    expect(parseFiles(t).map((f) => f.path)).toEqual(['a.ts'])
  })
  it('handles a streaming, unterminated block', () => {
    const f = parseFiles('```html\n<!doctype html><body>partial')
    expect(f[0].path).toBe('index.html')
    expect(f[0].content).toContain('partial')
  })
})

describe('cleanPath', () => {
  it('accepts normal project-relative paths and normalises separators', () => {
    expect(cleanPath('src\\lib\\a.ts')).toBe('src/lib/a.ts')
    expect(cleanPath('./src/a.ts')).toBe('src/a.ts')
  })
  it.each(['../x', 'a/../b', '/etc/passwd', 'C:\\Windows\\x', '.git/config', 'a/.GIT/x', 'file.', 'a:b', ''])('rejects %j', (p) => {
    expect(cleanPath(p)).toBeNull()
  })
})

describe('diffLines', () => {
  it('counts added and removed lines', () => {
    const d = diffLines('a\nb\nc\n', 'a\nB\nc\nd\n')
    expect(d.additions).toBe(2) // B, d
    expect(d.deletions).toBe(1) // b
  })
  it('reports no change for identical text', () => {
    const d = diffLines('x\ny\n', 'x\ny\n')
    expect(d.additions + d.deletions).toBe(0)
  })
  it('treats a new file as all additions', () => {
    const d = diffLines('', 'one\ntwo\n')
    expect(d.deletions).toBe(0)
    expect(d.additions).toBeGreaterThanOrEqual(2)
  })
  it('collapses long unchanged runs', () => {
    const before = Array.from({ length: 40 }, (_, i) => `l${i}`).join('\n')
    const after = before.replace('l20', 'CHANGED')
    const rows = collapse(diffLines(before, after).ops, 2)
    expect(rows.some((r) => r.type === 'gap')).toBe(true)
    expect(rows.length).toBeLessThan(15)
  })
})
