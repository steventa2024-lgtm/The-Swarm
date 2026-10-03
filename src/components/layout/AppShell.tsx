import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AgentsPage } from '@/pages/AgentsPage'
import { IntegrationsPage } from '@/pages/IntegrationsPage'
import { KnowledgePage } from '@/pages/KnowledgePage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SupportPage } from '@/pages/SupportPage'
import { SwarmPage } from '@/pages/SwarmPage'
import { TemplatesPage } from '@/pages/TemplatesPage'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { DEMO_PROMPT, useSwarm } from '@/store/swarm'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

let demoStarted = false

export function AppShell() {
  const page = useApp((s) => s.page)
  const hydrated = useApp((s) => s.hydrated)
  const reduceMotion = useApp((s) => s.preferences.reduceMotion)
  const [booted, setBooted] = useState(false)

  // Brief skeleton on launch, then open on a live demo run so the dashboard is never empty.
  useEffect(() => {
    if (!hydrated) return
    const t = window.setTimeout(() => {
      setBooted(true)
      if (!demoStarted && !useSwarm.getState().run) {
        demoStarted = true
        useSwarm.getState().start({ prompt: DEMO_PROMPT, warmupMs: 17_000, record: false })
      }
    }, 650)
    return () => window.clearTimeout(t)
  }, [hydrated])

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
      <TooltipProvider delayDuration={250}>
        <div className={cn('relative flex h-full w-full overflow-hidden', reduceMotion && 'reduce-motion')}>
          <div className="atmosphere" aria-hidden>
            <div className="orb animate-float" style={{ width: 420, height: 420, right: '8%', top: '-8%', background: 'rgba(37,99,255,.35)' }} />
            <div className="orb animate-float" style={{ width: 360, height: 360, left: '14%', bottom: '-12%', background: 'rgba(34,211,238,.16)', animationDelay: '-3s' }} />
          </div>
          <Sidebar />
          <div className="relative z-10 flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main className="min-h-0 flex-1 overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={page}
                  className="h-full"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {page === 'swarm' && <SwarmPage booting={!booted} />}
                  {page === 'projects' && <ProjectsPage />}
                  {page === 'agents' && <AgentsPage />}
                  {page === 'knowledge' && <KnowledgePage />}
                  {page === 'templates' && <TemplatesPage />}
                  {page === 'integrations' && <IntegrationsPage />}
                  {page === 'settings' && <SettingsPage />}
                  {page === 'support' && <SupportPage />}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        </div>
      </TooltipProvider>
    </MotionConfig>
  )
}
