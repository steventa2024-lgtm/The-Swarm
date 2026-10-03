import type { ReactNode } from 'react'

export interface DonutSlice { label: string; value: number; color: string }

export function DonutChart({
  slices, size = 96, thickness = 11, center,
}: { slices: DonutSlice[]; size?: number; thickness?: number; center?: ReactNode }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const gap = slices.length > 1 ? 3 : 0
  let offset = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(120,170,255,0.08)" strokeWidth={thickness} />
        {total > 0 &&
          slices.map((s) => {
            const len = Math.max(0, (s.value / total) * c - gap)
            const el = (
              <circle
                key={s.label}
                cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={s.color} strokeWidth={thickness} strokeLinecap="round"
                strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
                style={{ transition: 'stroke-dasharray 0.4s linear, stroke-dashoffset 0.4s linear', filter: `drop-shadow(0 0 4px ${s.color}88)` }}
              />
            )
            offset += (s.value / total) * c
            return el
          })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  )
}
