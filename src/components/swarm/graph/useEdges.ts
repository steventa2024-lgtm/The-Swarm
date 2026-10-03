import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'

export type Anchor = 'b' | 't' | 'l' | 'r'
export interface EdgeSpec { id: string; from: string; to: string; fromAnchor?: Anchor; toAnchor?: Anchor }
export interface MeasuredEdge extends EdgeSpec { d: string }

function point(rect: DOMRect, origin: DOMRect, a: Anchor): [number, number] {
  const x = rect.left - origin.left
  const y = rect.top - origin.top
  switch (a) {
    case 'b': return [x + rect.width / 2, y + rect.height]
    case 't': return [x + rect.width / 2, y]
    case 'l': return [x, y + rect.height / 2]
    case 'r': return [x + rect.width, y + rect.height / 2]
  }
}

/**
 * Measures `[data-node="id"]` elements inside the container and builds bezier
 * paths between them. Re-measures on resize and whenever `deps` change, so the
 * graph stays connected at any window size.
 */
export function useEdges(container: RefObject<HTMLElement | null>, edges: EdgeSpec[], depsKey: string) {
  const [measured, setMeasured] = useState<MeasuredEdge[]>([])
  const [box, setBox] = useState({ w: 0, h: 0 })
  const raf = useRef(0)

  const measure = useCallback(() => {
    const root = container.current
    if (!root) return
    const origin = root.getBoundingClientRect()
    setBox({ w: origin.width, h: origin.height })
    const next: MeasuredEdge[] = []
    for (const e of edges) {
      const a = root.querySelector(`[data-node="${e.from}"]`)
      const b = root.querySelector(`[data-node="${e.to}"]`)
      if (!a || !b) continue
      const fa = e.fromAnchor ?? 'b'
      const ta = e.toAnchor ?? 't'
      const [x1, y1] = point(a.getBoundingClientRect(), origin, fa)
      const [x2, y2] = point(b.getBoundingClientRect(), origin, ta)
      const horizontal = fa === 'r' || fa === 'l'
      const k = horizontal ? Math.abs(x2 - x1) * 0.5 : Math.max(18, Math.abs(y2 - y1) * 0.55)
      const d = horizontal
        ? `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}`
        : `M${x1},${y1} C${x1},${y1 + k} ${x2},${y2 - k} ${x2},${y2}`
      next.push({ ...e, d })
    }
    setMeasured(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, depsKey])

  const schedule = useCallback(() => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(measure)
  }, [measure])

  useLayoutEffect(() => {
    measure()
    const root = container.current
    if (!root) return
    const ro = new ResizeObserver(schedule)
    ro.observe(root)
    root.querySelectorAll('[data-node]').forEach((n) => ro.observe(n))
    // Entry animations settle after first paint; re-measure once they have.
    const t = window.setTimeout(measure, 450)
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); window.clearTimeout(t) }
  }, [container, measure, schedule])

  return { edges: measured, box }
}
