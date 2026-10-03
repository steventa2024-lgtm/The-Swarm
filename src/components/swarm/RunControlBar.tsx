import { Pause, Play, Plus, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { useSwarm } from '@/store/swarm'

export function RunControlBar() {
  const status = useSwarm((s) => s.run?.status ?? 'idle')
  const { pause, resume, stop, reset } = useSwarm.getState()

  const live = status === 'planning' || status === 'running' || status === 'reviewing'
  const paused = status === 'paused'
  const finished = status === 'completed' || status === 'stopped' || status === 'failed'

  return (
    <div className="flex items-center gap-1.5">
      {live && (
        <Tip label="Pause run">
          <Button variant="glass" size="sm" onClick={pause}><Pause className="h-3.5 w-3.5" />Pause</Button>
        </Tip>
      )}
      {paused && (
        <Button variant="primary" size="sm" onClick={resume}><Play className="h-3.5 w-3.5" />Resume</Button>
      )}
      {(live || paused) && (
        <Tip label="Stop run">
          <Button variant="danger" size="sm" onClick={stop}><Square className="h-3 w-3 fill-current" />Stop</Button>
        </Tip>
      )}
      {finished && (
        <Button variant="glass" size="sm" onClick={reset}><Plus className="h-3.5 w-3.5" />New run</Button>
      )}
    </div>
  )
}
