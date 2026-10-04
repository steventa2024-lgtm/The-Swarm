import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State { error: Error | null }

/**
 * Last line of defence: a rendering bug shows a recoverable screen instead of a blank window.
 * Reloading keeps all saved data (it lives in SQLite / localStorage, not in memory).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ZeroPulse] UI crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="relative flex h-full w-full items-center justify-center p-8">
        <div className="atmosphere" aria-hidden />
        <div className="glass relative z-10 max-w-[520px] rounded-3xl p-7 text-center shadow-glow">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-bad/15 text-bad">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-[17px] font-semibold text-ink">Something went wrong</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">The interface hit an unexpected error. Your projects, agents and settings are saved and will still be here after a reload.</p>
          <pre className="selectable mt-4 max-h-[140px] overflow-auto rounded-xl border hairline bg-night/60 p-3 text-left font-mono text-[11px] text-bad">
            {error.message || String(error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="grad-azure mt-5 inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-medium text-white shadow-[0_0_0_1px_rgba(150,200,255,0.35),0_8px_28px_-8px_rgba(59,130,255,0.9)] transition-all hover:brightness-110"
          >
            <RotateCcw className="h-4 w-4" />Reload
          </button>
        </div>
      </div>
    )
  }
}
