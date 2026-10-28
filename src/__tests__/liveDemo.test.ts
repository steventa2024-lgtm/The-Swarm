import { expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { liveDriver } from '@/engine/liveDriver'
import { seedAgents } from '@/data/seed'
import type { Provider, Run } from '@/types'

// Opt-in real inference. No model fixture or project writes; the proposal awaits Zero.
it.skipIf(process.env.SWARM_LIVE_DEMO !== '1')('decomposes a real task, uses two agents and reviews before owner apply', async () => {
  ;(globalThis as unknown as { window: unknown }).window = globalThis
  const provider: Provider = { id:'ollama', name:'Ollama', kind:'ollama', endpoint:'http://127.0.0.1:11434', local:true, status:'connected', verified:true, models:[{id:'qwen2.5-coder:7b',label:'Qwen 2.5 Coder 7B',tier:'local',contextWindow:32000,inputCostPer1M:0,outputCostPer1M:0,tokensPerSecond:30}] }
  const prompt = 'Build a tiny static page for The Swarm. Assign frontend to create index.html with a heading and stylesheet link; assign backend to create styles.css with an accessible dark theme. Both workers MUST have tasks, never skip. Each file under 30 lines. Review both outputs. All files are proposals; Zero alone approves applying them.'
  let controller: ReturnType<typeof liveDriver.start> | undefined
  const run = await new Promise<Run>((resolve,reject) => {
    const timeout = setTimeout(()=> { controller?.stop(); reject(new Error('Real demo exceeded 10 minutes')) },600_000)
    controller = liveDriver.start({prompt,projectId:'proj-zeropulse',mode:'local-only',requestedAgents:2,attachments:[]}, {providers:[provider],agents:seedAgents.filter((a)=>['planner','frontend','backend','reviewer'].includes(a.role)).map((a)=>({...a,name:`Ollama · ${a.role}`})),maxWorkers:2,getSpeed:()=>1}, (snapshot)=> {
      if (['completed','failed','stopped'].includes(snapshot.status)) { clearTimeout(timeout); resolve(snapshot) }
    })
  })
  controller?.dispose()
  await mkdir('public', {recursive:true}); await writeFile('public/demo-run.json', JSON.stringify(run,null,2))
  expect(run.status).toBe('completed'); expect(run.reviewVerdict).toBe('approved')
  expect(run.workers.slice(1,-1).filter((w)=>w.status==='done' && w.tokensOut>0)).toHaveLength(2)
  expect(new Set(run.fileChanges.map((f)=>f.workerId)).size).toBe(2)
  expect(run.fileChanges.length).toBeGreaterThanOrEqual(2)
}, 610_000)
