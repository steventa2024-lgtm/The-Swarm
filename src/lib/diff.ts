export type DiffOp = { type: 'ctx' | 'add' | 'del'; text: string }
export interface DiffResult {
  ops: DiffOp[]
  additions: number
  deletions: number
  /** True when the files were too large to diff line-by-line; treated as a full rewrite. */
  coarse: boolean
}

const MAX_CELLS = 4_000_000

/** Line diff via LCS. Falls back to a coarse replace for very large inputs. */
export function diffLines(before: string, after: string): DiffResult {
  const a = before === '' ? [] : before.replace(/\r\n/g, '\n').split('\n')
  const b = after === '' ? [] : after.replace(/\r\n/g, '\n').split('\n')

  // Trim the common head/tail so the DP only covers the changed middle.
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  const am = a.slice(head, a.length - tail)
  const bm = b.slice(head, b.length - tail)

  const ops: DiffOp[] = a.slice(0, head).map((text) => ({ type: 'ctx', text }))
  let coarse = false

  if (am.length * bm.length > MAX_CELLS) {
    coarse = true
    for (const text of am) ops.push({ type: 'del', text })
    for (const text of bm) ops.push({ type: 'add', text })
  } else {
    const n = am.length
    const m = bm.length
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = am[i] === bm[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (am[i] === bm[j]) { ops.push({ type: 'ctx', text: am[i] }); i++; j++ }
      else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ type: 'del', text: am[i++] })
      else ops.push({ type: 'add', text: bm[j++] })
    }
    while (i < n) ops.push({ type: 'del', text: am[i++] })
    while (j < m) ops.push({ type: 'add', text: bm[j++] })
  }

  for (const text of a.slice(a.length - tail)) ops.push({ type: 'ctx', text })
  return {
    ops,
    additions: ops.filter((o) => o.type === 'add').length,
    deletions: ops.filter((o) => o.type === 'del').length,
    coarse,
  }
}

/** Collapses long unchanged stretches, keeping `context` lines around each change. */
export function collapse(ops: DiffOp[], context = 3): (DiffOp | { type: 'gap'; hidden: number })[] {
  const keep = new Array<boolean>(ops.length).fill(false)
  ops.forEach((o, i) => {
    if (o.type === 'ctx') return
    for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) keep[k] = true
  })
  const out: (DiffOp | { type: 'gap'; hidden: number })[] = []
  let hidden = 0
  ops.forEach((o, i) => {
    if (keep[i]) {
      if (hidden) { out.push({ type: 'gap', hidden }); hidden = 0 }
      out.push(o)
    } else hidden++
  })
  if (hidden) out.push({ type: 'gap', hidden })
  return out
}
