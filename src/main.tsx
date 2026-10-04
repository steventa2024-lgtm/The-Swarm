import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { AppShell } from '@/components/layout/AppShell'
import * as checks from '@/lib/checks'
import { useApp } from '@/store/app'
import { useSwarm } from '@/store/swarm'
import './index.css'

// Dev-only handle so automated checks can seed state. Not present in production builds.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__stores = { useApp, useSwarm, checks }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  </StrictMode>,
)
