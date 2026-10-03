import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppShell } from '@/components/layout/AppShell'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'
import './index.css'

// Dev-only handle so automated checks can seed state. Not present in production builds.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__stores = { useApp, useSwarm }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
)
