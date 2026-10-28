import { lazy, Suspense } from 'react'
import { FAMILIARS, type FamiliarId, type MascotState } from '@/data/familiars'
const FamiliarView = lazy(() => import('./three/SharedFamiliarScene').then((module) => ({ default: module.FamiliarView })))
export function AgentMascot({ id, state, portrait = false, preview = false }: { id: FamiliarId; state: MascotState; portrait?: boolean; preview?: boolean }) {
  const f = FAMILIARS.find((f) => f.id === id)!
  return <Suspense fallback={<div className={`agent-mascot mascot-reference ${portrait ? 'mascot-portrait' : ''}`} data-renderer="loading"><img src={`/hardlight/avatars_png/${id}_512.png`} alt={`${f.name} static reference while 3D loads`} /><span className="mascot-fallback-label">Loading 3D · static reference</span></div>}><FamiliarView id={id} state={state} portrait={portrait} preview={preview} /></Suspense>
}
