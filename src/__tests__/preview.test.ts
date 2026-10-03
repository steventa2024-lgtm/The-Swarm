import { describe, expect, it } from 'vitest'
import { buildBundle, looksPreviewable, signature, toSrcdoc } from '@/preview/build'

describe('buildBundle — static HTML', () => {
  const files = [
    { path: 'index.html', content: '<html><head><link rel="stylesheet" href="/style.css"></head><body><script src="app.js"></script></body></html>' },
    { path: 'style.css', content: 'body{background:#123}' },
    { path: 'app.js', content: 'document.title = "hi"' },
  ]
  it('serves index.html as the entry with an error hook injected', () => {
    const b = buildBundle(files)
    expect(b.kind).toBe('html')
    expect(b.entry).toBe('index.html')
    expect(b.files.find((f) => f.path === 'index.html')!.content).toContain('preview-error')
  })
  it('turns root-absolute URLs into relative ones', () => {
    const html = buildBundle(files).files.find((f) => f.path === 'index.html')!.content
    expect(html).toContain('href="style.css"')
    expect(html).not.toContain('href="/style.css"')
  })
  it('works when the entry is in a subfolder', () => {
    const b = buildBundle([{ path: 'web/index.html', content: '<p>x</p>' }, { path: 'web/a.css', content: 'p{}' }])
    expect(b.entry).toBe('index.html')
    expect(b.files.map((f) => f.path)).toContain('a.css')
  })
  it('inlines css and js for the single-document fallback', () => {
    const doc = toSrcdoc(buildBundle(files))!
    expect(doc).toContain('<style>body{background:#123}</style>')
    expect(doc).toContain('document.title = "hi"')
  })
})

describe('buildBundle — React', () => {
  const app = [
    { path: 'src/App.tsx', content: "import { useState } from 'react'\nimport Toggle from './components/Toggle'\nimport './app.css'\nexport default function App(){ const [n]=useState<number>(0); return <Toggle n={n}/> }" },
    { path: 'src/components/Toggle.tsx', content: 'export default function Toggle({ n }: { n: number }) { return <button>{n}</button> }' },
    { path: 'src/app.css', content: 'button{color:red}' },
    { path: 'src/App.test.tsx', content: "import App from './App'\ntest('x',()=>{})" },
  ]
  it('transpiles TSX, rewrites relative imports, and builds an import map', () => {
    const b = buildBundle(app)
    expect(b.kind).toBe('react')
    expect(b.entry).toBe('index.html')
    const appJs = b.files.find((f) => f.path === 'src/App.js')!.content
    expect(appJs).not.toContain('useState<number>') // types stripped
    expect(appJs).toContain("./components/Toggle.js")
    expect(appJs).not.toContain('app.css')
    const html = b.files.find((f) => f.path === 'index.html')!.content
    expect(html).toContain('importmap')
    expect(html).toContain('href="src/app.css"')
  })
  it('leaves test files out of the bundle', () => {
    expect(buildBundle(app).files.some((f) => /App\.test/.test(f.path))).toBe(false)
  })
  it('maps third-party packages to the CDN', () => {
    const b = buildBundle([{ path: 'App.jsx', content: "import { Smile } from 'lucide-react'\nexport default () => <Smile />" }])
    expect(b.files.find((f) => f.path === 'index.html')!.content).toContain('https://esm.sh/lucide-react')
  })
  it('uses a Next-style page.tsx as the root when there is no App file', () => {
    const b = buildBundle([{ path: 'src/app/page.tsx', content: "export default function Page() { return <main>Hello</main> }" }])
    expect(b.kind).toBe('react')
    expect(b.files.find((f) => f.path === '__entry.js')!.content).toContain('./src/app/page.js')
  })
  it('reports a syntax error instead of throwing', () => {
    const b = buildBundle([{ path: 'App.tsx', content: 'export default function App( { return <div>' }])
    expect(b.kind).toBe('none')
    expect(b.note).toMatch(/Syntax error/)
  })
})

describe('buildBundle — HTML page that loads a raw .tsx (what a local model actually produced)', () => {
  const files = [
    {
      path: 'index.html',
      content:
        '<!DOCTYPE html><html><head><title>Todo</title><link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet"></head>' +
        '<body class="bg-black text-white"><div id="root"></div><script src="app/TodoApp.tsx"></script></body></html>',
    },
    {
      path: 'app/TodoApp.tsx',
      content:
        "import { useState } from 'react'\nimport TodoItem from '../components/TodoItem'\nexport default function TodoApp() { const [t] = useState<string[]>(['a']); return <ul>{t.map((x) => <TodoItem key={x} text={x} />)}</ul> }",
    },
    { path: 'components/TodoItem.tsx', content: 'export default function TodoItem({ text }: { text: string }) { return <li>{text}</li> }' },
  ]
  it('is rebuilt as a React app instead of serving the .tsx as a script', () => {
    const b = buildBundle(files)
    expect(b.kind).toBe('react')
    expect(b.entry).toBe('index.html')
    const html = b.files.find((f) => f.path === 'index.html')!.content
    expect(html).not.toContain('TodoApp.tsx')
    expect(html).toContain('type="module" src="__entry.js"')
    expect(html).toContain('bg-black') // keeps the model's own page and styling
    expect(html).toContain('tailwind.min.css')
    expect(html).toContain('importmap')
  })
  it('mounts the default-exported component and resolves ../ imports', () => {
    const b = buildBundle(files)
    expect(b.files.find((f) => f.path === '__entry.js')!.content).toContain('./app/TodoApp.js')
    expect(b.files.find((f) => f.path === 'app/TodoApp.js')!.content).toContain('../components/TodoItem.js')
  })
  it('does not double-add a root element', () => {
    const html = buildBundle(files).files.find((f) => f.path === 'index.html')!.content
    expect(html.match(/id="root"/g)).toHaveLength(1)
  })
  it('adds a root element when the page has none', () => {
    const b = buildBundle([{ path: 'index.html', content: '<html><body><script src="main.tsx"></script></body></html>' },
      { path: 'main.tsx', content: "import { createRoot } from 'react-dom/client'\ncreateRoot(document.body).render(<h1>x</h1>)" }])
    expect(b.kind).toBe('react')
    expect(b.files.find((f) => f.path === 'index.html')!.content).toContain('id="root"')
  })
  it('falls back to the plain page if the referenced script was never produced', () => {
    const b = buildBundle([{ path: 'index.html', content: '<body><script src="missing.tsx"></script></body>' }])
    expect(b.kind).toBe('html')
  })
})

describe('buildBundle — nothing to show', () => {
  it('returns none for backend-only code, with a reason', () => {
    const b = buildBundle([{ path: 'src/server.ts', content: 'export const x = 1' }])
    expect(b.kind).toBe('none')
    expect(b.entry).toBe('')
    expect(b.files).toEqual([])
    expect(b.note).toBeTruthy()
  })
  it('returns none for docs only', () => expect(buildBundle([{ path: 'README.md', content: '# hi' }]).kind).toBe('none'))
})

describe('helpers', () => {
  it('looksPreviewable is a cheap pre-check', () => {
    expect(looksPreviewable(['a.ts', 'index.html'])).toBe(true)
    expect(looksPreviewable(['src/App.tsx'])).toBe(true)
    expect(looksPreviewable(['src/server.ts', 'README.md'])).toBe(false)
  })
  it('signature changes with content and is stable otherwise', () => {
    const a = signature([{ path: 'a', content: '1' }])
    expect(signature([{ path: 'a', content: '1' }])).toBe(a)
    expect(signature([{ path: 'a', content: '2' }])).not.toBe(a)
  })
})
