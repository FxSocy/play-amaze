import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches a crash anywhere in the game and shows it.
 *
 * Without this, an exception thrown while rendering or in an effect unmounts
 * the whole tree and leaves a blank page — invisible on a phone, where there is
 * no console to check. A run in progress is lost either way, but the player can
 * see what happened, report it, and carry on.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Amaze crashed', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="crash">
        <div className="crash-card">
          <h2>Amaze hit a problem</h2>
          <p className="help">
            The run that was in progress is lost. Reloading starts a fresh maze; saved times and
            daily results are untouched.
          </p>
          <pre className="crash-detail">{error.message || String(error)}</pre>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
