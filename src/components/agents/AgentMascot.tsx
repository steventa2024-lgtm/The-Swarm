import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { FAMILIARS, type FamiliarId, type MascotState } from '@/data/familiars'
import { useApp } from '@/store/app'
export function AgentMascot({ id, state, portrait = false, preview = false }: { id: FamiliarId; state: MascotState; portrait?: boolean; preview?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), [visible, setVisible] = useState(true)
  const motion = useApp((s) => s.preferences.reduceMotion ? 'off' : s.preferences.mascotMotion ?? 'subtle')
  const f = FAMILIARS.find((f) => f.id === id)!
  useEffect(() => { if (!ref.current) return; const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting)); observer.observe(ref.current); return () => observer.disconnect() }, [])
  return <div ref={ref} className={`agent-mascot ${portrait ? 'mascot-portrait' : ''}`} data-state={state} data-motion={motion} data-visible={visible} style={{ '--familiar': f.color } as CSSProperties}>
    <div className="mascot-aura" /><img loading="lazy" src={portrait ? `/hardlight/portraits/${id}_portrait.png` : `/hardlight/avatars_png/${id}_512.png`} alt={`${f.name} · ${f.animal} · ${preview ? 'Preview' : state.replaceAll('_', ' ')}`} />
    <i className="mascot-particle p-one" /><i className="mascot-particle p-two" /><span className="mascot-emote" aria-hidden>{state === 'waiting_approval' ? '◇' : state === 'failed' ? '!' : state === 'completed' ? '✓' : ''}</span>
  </div>
}
