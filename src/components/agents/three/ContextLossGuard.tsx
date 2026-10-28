import { useLayoutEffect } from 'react'
import { useThree } from '@react-three/fiber'

/** Remove the listener before R3F intentionally releases a renderer on unmount. */
export function ContextLossGuard({ onLoss }: { onLoss: () => void }) {
  const canvas = useThree((s) => s.gl.domElement)
  useLayoutEffect(() => {
    const handle = (event: Event) => { event.preventDefault(); onLoss() }
    canvas.addEventListener('webglcontextlost', handle)
    return () => canvas.removeEventListener('webglcontextlost', handle)
  }, [canvas, onLoss])
  return null
}
