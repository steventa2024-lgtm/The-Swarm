import { transform } from 'sucrase'

/**
 * Turns the files agents proposed into something an iframe can run.
 *  - html:  a static site (index.html + css/js) is served as-is.
 *  - react: TS/JSX modules are transpiled in the browser and loaded with an
 *           import map (React and other packages come from esm.sh).
 *  - none:  nothing visual to show (backend code, tests, docs).
 */

export interface PreviewFile { path: string; content: string }
export interface Bundle {
  kind: 'html' | 'react' | 'none'
  entry: string
  files: PreviewFile[]
  /** Human-readable reason when kind is 'none', or a heads-up otherwise. */
  note?: string
  /** True if the page loads libraries from a CDN, so it needs internet. */
  usesNetwork: boolean
}

// Reports runtime errors from the sandboxed page back to the app.
const ERROR_HOOK =
  `<script>(function(){function s(m){try{parent.postMessage({zp:'preview-error',message:String(m).slice(0,400)},'*')}catch(e){}}` +
  // Failed <script>/<link> loads don't bubble to window handlers; catch them while capturing.
  `addEventListener('error',function(e){var t=e.target;if(t&&t!==window&&(t.src||t.href)){s('Failed to load '+String(t.src||t.href).split('/').slice(-2).join('/'))}},true);` +
  `addEventListener('error',function(e){s(e.message+(e.filename?' ('+e.filename.split('/').pop()+':'+e.lineno+')':''))});` +
  `addEventListener('unhandledrejection',function(e){s('Unhandled: '+((e.reason&&e.reason.message)||e.reason))});` +
  `var ce=console.error;console.error=function(){s([].slice.call(arguments).join(' '));ce.apply(console,arguments)}})();</script>`

const isTest = (p: string) => /\.(test|spec)\.[jt]sx?$/.test(p) || /(^|\/)(__tests__|tests?)\//.test(p)
const MODULE = /\.(tsx?|jsx?|mjs)$/
const dirname = (p: string) => p.split('/').slice(0, -1).join('/')

function normalize(path: string): string {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

function relative(from: string, to: string): string {
  const a = dirname(from).split('/').filter(Boolean)
  const b = to.split('/')
  let i = 0
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++
  const ups = a.length - i
  const rel = [...Array(ups).fill('..'), ...b.slice(i)].join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

const outPath = (p: string) => p.replace(MODULE, '.js')

function injectHead(html: string, extra: string): string {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${extra}`)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${extra}</head>`)
  return `${extra}${html}`
}

/** Root-absolute URLs ("/style.css") would escape the preview's folder; make them relative. */
const relativizeRoot = (html: string) => html.replace(/\b(src|href)=(["'])\/(?!\/)/gi, '$1=$2')

function buildHtml(files: PreviewFile[]): Bundle {
  const html = files.filter((f) => /\.html?$/i.test(f.path))
  const entryFile = html.find((f) => /(^|\/)index\.html?$/i.test(f.path)) ?? html[0]
  const base = dirname(entryFile.path)
  // Serve the site from the entry's folder so relative URLs resolve naturally.
  const strip = (p: string) => (base && p.startsWith(`${base}/`) ? p.slice(base.length + 1) : p)

  // Models often write an HTML page that loads a raw .tsx/.jsx file, which a browser can't run.
  // Treat that as a React app: transpile the modules and load them through the page instead.
  const moduleRefs = [...entryFile.content.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.(?:tsx|jsx|ts))["'][^>]*>\s*<\/script>/gi)]
  if (moduleRefs.length > 0) {
    const rooted = files.map((f) => ({ path: strip(f.path), content: f.content }))
    const page = rooted.find((f) => f.path === strip(entryFile.path))!
    const hybrid = buildReact(rooted, { html: page, mainRef: normalize(moduleRefs[0][1]) })
    if (hybrid.kind !== 'none') return hybrid
  }

  const out = files.map((f) =>
    f === entryFile
      ? { path: strip(f.path), content: injectHead(relativizeRoot(f.content), ERROR_HOOK) }
      : { path: strip(f.path), content: f.content },
  )
  return {
    kind: 'html',
    entry: strip(entryFile.path),
    files: out,
    usesNetwork: /https?:\/\//.test(entryFile.content),
  }
}

const REACT_MAP: Record<string, string> = {
  react: 'https://esm.sh/react@19',
  'react/jsx-runtime': 'https://esm.sh/react@19/jsx-runtime',
  'react/jsx-dev-runtime': 'https://esm.sh/react@19/jsx-dev-runtime',
  'react-dom': 'https://esm.sh/react-dom@19?external=react',
  'react-dom/client': 'https://esm.sh/react-dom@19/client?external=react',
}

interface HtmlHost { html: PreviewFile; mainRef: string }

function buildReact(files: PreviewFile[], host?: HtmlHost): Bundle {
  const mods = files.filter((f) => MODULE.test(f.path) && !isTest(f.path))
  const byPath = new Map(mods.map((f) => [f.path, f]))
  const css = files.filter((f) => /\.css$/i.test(f.path))

  // When a page names its script (<script src="app/TodoApp.tsx">), that module is the entry:
  // a component with a default export gets mounted into #root; anything else just runs.
  const named = host
    ? ['', '.tsx', '.ts', '.jsx', '.js'].map((e) => byPath.get(host.mainRef + e)).find(Boolean)
    : undefined
  const namedMounts = named ? /createRoot|ReactDOM|document\.|getElementById/.test(named.content) : false
  const namedIsComponent = !!named && /export\s+default/.test(named.content) && !namedMounts

  const app = namedIsComponent
    ? named
    : mods.filter((f) => /(^|\/)App\.(tsx|jsx|js|ts)$/.test(f.path)).sort((a, b) => a.path.length - b.path.length)[0]
  const main = named && !namedIsComponent
    ? named
    : mods.find((f) => /(^|\/)(main|index)\.(tsx|jsx)$/.test(f.path) && /createRoot|ReactDOM/.test(f.content))
  // No App file? A component with a default export (Next-style page.tsx, Home.jsx…) can stand in as the root.
  const looksLikeComponent = (f: PreviewFile) => /export\s+default/.test(f.content) && /<[A-Za-z][^>]*>/.test(f.content)
  const stand = !app && !main
    ? mods
        .filter(looksLikeComponent)
        .sort((a, b) => Number(/(^|\/)(page|home|index)\./i.test(b.path)) - Number(/(^|\/)(page|home|index)\./i.test(a.path)) || a.path.length - b.path.length)[0]
    : undefined
  if (!app && !main && !stand) {
    return { kind: 'none', entry: '', files: [], usesNetwork: false, note: 'No App component or entry file to render.' }
  }

  const bare = new Set<string>()
  const outFiles: PreviewFile[] = []

  const resolve = (from: string, spec: string): string | null => {
    const target = normalize(`${dirname(from)}/${spec}`)
    const tries = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js']
    for (const t of tries) if (byPath.has(target + t)) return target + t
    return null
  }

  for (const f of mods) {
    let code: string
    try {
      code = transform(f.content, { transforms: ['typescript', 'jsx'], jsxRuntime: 'automatic', production: true, filePath: f.path }).code
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { kind: 'none', entry: '', files: [], usesNetwork: false, note: `Syntax error in ${f.path}: ${msg}` }
    }
    // Plain CSS imports become <link> tags below.
    code = code.replace(/import\s*(['"])[^'"]+\.css\1;?/g, '')
    // Relative imports → the transpiled file's real path.
    code = code.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}(?:\/[^'"\n]*)?)\2/g, (m, pre, q, spec) => {
      const hit = resolve(f.path, spec)
      return hit ? `${pre}${q}${relative(f.path, outPath(hit))}${q}` : m
    })
    for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"./][^'"]*)\1/g)) bare.add(m[2])
    outFiles.push({ path: outPath(f.path), content: code })
  }

  const imports: Record<string, string> = { ...REACT_MAP }
  for (const spec of bare) {
    if (!imports[spec]) imports[spec] = `https://esm.sh/${spec}?external=react,react-dom`
  }

  let entry: string
  if (main) {
    entry = outPath(main.path)
  } else {
    entry = '__entry.js'
    outFiles.push({
      path: entry,
      content:
        `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './${outPath((app ?? stand)!.path)}';\n` +
        `createRoot(document.getElementById('root')).render(React.createElement(App));\n`,
    })
  }

  const importMap = `<script type="importmap">${JSON.stringify({ imports })}</script>`
  const moduleTag = `<script type="module" src="${entry}"></script>`
  let html: string
  if (host) {
    // Keep the page the model wrote (its markup, styles, CDN links); swap its raw .tsx/.jsx script for ours.
    let h = relativizeRoot(host.html.content).replace(/<script\b[^>]*\bsrc=["'][^"']+\.(?:tsx|jsx|ts)["'][^>]*>\s*<\/script>/gi, '')
    h = injectHead(h, ERROR_HOOK + importMap)
    if (!/\bid=["']root["']/.test(h)) h = /<body[^>]*>/i.test(h) ? h.replace(/<body[^>]*>/i, (m) => `${m}<div id="root"></div>`) : `${h}<div id="root"></div>`
    // CSS files the page doesn't already link.
    const unlinked = css.filter((c) => !h.includes(c.path)).map((c) => `<link rel="stylesheet" href="${c.path}">`).join('')
    h = unlinked ? injectHead(h, unlinked) : h
    html = /<\/body>/i.test(h) ? h.replace(/<\/body>/i, `${moduleTag}</body>`) : `${h}${moduleTag}`
  } else {
    html =
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `${ERROR_HOOK}${importMap}` +
      `<style>html,body{margin:0}body{font-family:system-ui,-apple-system,Segoe UI,sans-serif}</style>` +
      css.map((c) => `<link rel="stylesheet" href="${c.path}">`).join('') +
      `</head><body><div id="root"></div>${moduleTag}</body></html>`
  }

  const pagePath = host ? host.html.path : 'index.html'
  const otherAssets = host ? files.filter((f) => !MODULE.test(f.path) && !css.includes(f) && f !== host.html) : []
  return {
    kind: 'react',
    entry: pagePath,
    files: [{ path: pagePath, content: html }, ...css, ...otherAssets, ...outFiles],
    usesNetwork: true,
    note: 'React and other packages load from esm.sh, so this preview needs an internet connection.',
  }
}

/** Cheap check (no transpiling) for whether anything here could be shown. */
export function looksPreviewable(paths: string[]): boolean {
  return paths.some((p) => /\.html?$/i.test(p) || /(^|\/)App\.(tsx|jsx|js|ts)$/.test(p) || /(^|\/)(main|index)\.(tsx|jsx)$/.test(p))
}

export function buildBundle(files: PreviewFile[]): Bundle {
  const clean = files.filter((f) => f.content.trim().length > 0)
  if (clean.some((f) => /\.html?$/i.test(f.path))) return buildHtml(clean)
  if (clean.some((f) => MODULE.test(f.path) && !isTest(f.path))) {
    const b = buildReact(clean)
    if (b.kind !== 'none') return b
    return { ...b, note: b.note }
  }
  return { kind: 'none', entry: '', files: [], usesNetwork: false, note: 'These files have nothing visual to preview (no index.html or App component).' }
}

/** Single-document version for environments without the preview server (browser dev). */
export function toSrcdoc(bundle: Bundle): string | null {
  if (bundle.kind !== 'html') return null
  const get = (p: string) => bundle.files.find((f) => f.path === normalize(p))?.content
  let html = get(bundle.entry) ?? ''
  html = html.replace(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi, (m, href) => {
    const css = get(href)
    return css === undefined ? m : `<style>${css}</style>`
  })
  html = html.replace(/<script([^>]*)\ssrc=["']([^"']+\.js)["']([^>]*)><\/script>/gi, (m, a, src, b) => {
    const js = get(src)
    return js === undefined ? m : `<script${a}${b}>${js.replace(/<\/script/gi, '<\\/script')}</script>`
  })
  return html
}

/** Cheap content signature so the preview only reloads when something actually changed. */
export function signature(files: PreviewFile[]): string {
  let h = 5381
  for (const f of files) {
    const s = f.path + '\0' + f.content
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return `${files.length}:${h >>> 0}`
}
