import { useId } from 'react'

export function Sparkline({
  data, color = '#4d9bff', height = 36, className,
}: { data: number[]; color?: string; height?: number; className?: string }) {
  const id = useId()
  const w = 120
  const pts = data.length > 1 ? data : [0, 0]
  const max = Math.max(...pts, 1e-9)
  const min = Math.min(...pts)
  const range = max - min || 1
  const coords = pts.map((v, i) => [(i / (pts.length - 1)) * w, height - 3 - ((v - min) / range) * (height - 8)] as const)
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${w},${height} L0,${height} Z`
  const [lx, ly] = coords[coords.length - 1]
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={className} style={{ width: '100%', height }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.38" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="2.2" fill={color} />
    </svg>
  )
}
