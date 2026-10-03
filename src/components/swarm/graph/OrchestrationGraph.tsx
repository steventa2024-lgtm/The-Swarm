import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { Skeleton } from '@/components/common/LoadingState'
import { cn } from '@/lib/utils'
import { useSwarm } from '@/store/swarm'
import type { Run, Worker } from '@/types'
import { FinalNode, StageNode, TaskNode, WorkerNode } from './GraphNodes'
import { useEdges, type EdgeSpec } from './useEdges'

type EdgeState = 'idle' | 'ready' | 'active' | 'done'

const GHOST_WORKERS = 3

function edgeState(src: Worker | 'task' | null, dst: Worker | 'final' | null, run: Run | null): EdgeState {
  if (!run) return 'idle'
  const s = src === 'task' ? 'done' : src?.status
  const d = dst === 'final' ? (run.status === 'completed' ? 'done' : 'queued') : dst?.status
  if (s === 'done' && d === 'done') return 'done'
  if (s === 'done' && d === 'working') return 'active'
  if (s === 'done') return 'ready'
  return 'idle'
}

const EDGE_STYLE: Record<EdgeState, { stroke: string; width: number; opacity: number; dash?: string }> = {
  idle: { stroke: '#4a6bb0', width: 1.2, opacity: 0.35, dash: '3 6' },
  ready: { stroke: '#4d9bff', width: 1.4, opacity: 0.55 },
  active: { stroke: '#6db0ff', width: 2, opacity: 1, dash: '5 9' },
  done: { stroke: '#4d9bff', width: 1.6, opacity: 0.8 },
}

export function OrchestrationGraph({ run, loading, onOpenFinal }: { run: Run | null; loading: boolean; onOpenFinal: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const selectedId = useSwarm((s) => s.selectedId)
  const select = useSwarm((s) => s.select)

  const planner = run?.workers[0]
  const reviewer = run && run.workers.length > 1 ? run.workers[run.workers.length - 1] : undefined
  const workers = run ? run.workers.slice(1, -1) : []
  const ghost = !run
  const workerKeys = ghost ? Array.from({ length: GHOST_WORKERS }, (_, i) => `ghost:${i}`) : workers.map((w) => `w:${w.id}`)

  const edgeSpecs = useMemo<EdgeSpec[]>(() => [
    { id: 'task-planner', from: 'task', to: 'planner' },
    ...workerKeys.flatMap((k) => [
      { id: `planner-${k}`, from: 'planner', to: k },
      { id: `${k}-reviewer`, from: k, to: 'reviewer' },
    ]),
    { id: 'reviewer-final', from: 'reviewer', to: 'final', fromAnchor: 'r' as const, toAnchor: 'l' as const },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [workerKeys.join('|')])

  const { edges, box } = useEdges(ref, edgeSpecs, workerKeys.join('|') + (loading ? ':l' : ''))

  const stateFor = (id: string): EdgeState => {
    if (id === 'task-planner') return edgeState('task', planner ?? null, run)
    if (id === 'reviewer-final') return edgeState(reviewer ?? null, 'final', run)
    const wk = workers.find((w) => id === `planner-w:${w.id}` || id === `w:${w.id}-reviewer`)
    if (!wk) return 'idle'
    if (id.startsWith('planner-')) return edgeState(planner ?? null, wk, run)
    return edgeState(wk, reviewer ?? null, run)
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center gap-9 py-4">
        <Skeleton className="h-[64px] w-[360px]" />
        <Skeleton className="h-[92px] w-[360px]" />
        <div className="flex w-full gap-3"><Skeleton className="h-[190px] flex-1" /><Skeleton className="h-[190px] flex-1" /><Skeleton className="h-[190px] flex-1" /></div>
        <Skeleton className="h-[92px] w-[360px]" />
      </div>
    )
  }

  return (
    <div ref={ref} className="relative flex flex-col items-center gap-[30px] py-1">
      {/* Edges sit under the nodes */}
      <svg className="pointer-events-none absolute inset-0 overflow-visible" width={box.w} height={box.h} aria-hidden>
        <defs>
          <filter id="edge-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        {edges.map((e) => {
          const st = EDGE_STYLE[stateFor(e.id)]
          const state = stateFor(e.id)
          return (
            <g key={e.id} style={{ opacity: st.opacity, transition: 'opacity .4s' }}>
              {(state === 'active' || state === 'done') && (
                <path d={e.d} fill="none" stroke={st.stroke} strokeWidth={st.width + 3} opacity={0.35} filter="url(#edge-glow)" />
              )}
              <path
                d={e.d} fill="none" stroke={st.stroke} strokeWidth={st.width} strokeLinecap="round"
                strokeDasharray={st.dash} className={cn(state === 'active' && 'animate-flow')}
              />
              {state === 'active' && (
                <circle r="3" fill="#bfe0ff" style={{ filter: 'drop-shadow(0 0 5px #6db0ff)' }}>
                  <animateMotion dur="1.6s" repeatCount="indefinite" path={e.d} />
                </circle>
              )}
            </g>
          )
        })}
      </svg>

      <TaskNode run={run} ghost={ghost} />
      <StageNode label="Planner" worker={planner} ghost={ghost} selected={!!planner && selectedId === planner.id} onSelect={planner ? () => select(selectedId === planner.id ? null : planner.id) : undefined} />

      <div className="flex w-full max-w-[980px] items-stretch gap-3">
        {ghost
          ? Array.from({ length: GHOST_WORKERS }, (_, i) => <WorkerNode key={i} index={i} ghost />)
          : workers.map((w, i) => (
              <WorkerNode key={w.id} worker={w} index={i} selected={selectedId === w.id} onSelect={() => select(selectedId === w.id ? null : w.id)} />
            ))}
      </div>

      <div className="flex w-full items-center justify-center gap-14 max-lg:flex-col max-lg:gap-[30px]">
        <StageNode label="Reviewer" worker={reviewer} ghost={ghost} selected={!!reviewer && selectedId === reviewer.id} onSelect={reviewer ? () => select(selectedId === reviewer.id ? null : reviewer.id) : undefined} />
        <FinalNode run={run} ghost={ghost} onOpen={onOpenFinal} />
      </div>

      {ghost && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="glass absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl px-6 py-5 text-center shadow-glow"
        >
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-azure/20 text-azure-hi"><Sparkles className="h-5 w-5" /></div>
          <p className="text-sm font-semibold text-ink">Assemble your swarm</p>
          <p className="mt-1 max-w-[240px] text-xs text-ink-3">Describe a task above. The planner will split it across 2–4 workers that run in parallel.</p>
        </motion.div>
      )}
    </div>
  )
}
