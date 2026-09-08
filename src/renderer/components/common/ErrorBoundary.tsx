import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Kurzer Name des Bereichs, z. B. „Studienplaner". */
  label: string
  children: ReactNode
  /** Optionaler eigener Fallback statt der Standard-Karte. */
  fallback?: (reset: () => void, error: Error) => ReactNode
}
interface State {
  error: Error | null
}

/**
 * Fängt Render-Fehler in einem Teilbaum ab, damit ein einzelner kaputter
 * Bereich nicht die ganze App weiß macht. Zeigt eine kleine Karte mit
 * „Nochmal versuchen" und der Fehlermeldung.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.label}] Render-Fehler:`, error, info.componentStack)
  }

  reset = (): void => this.setState({ error: null })

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(this.reset, error)
    return (
      <div className="errbound">
        <div className="errbound__box">
          <strong>{this.props.label} ist abgestürzt.</strong>
          <p>
            Der Bereich konnte nicht angezeigt werden. Deine Dateien sind nicht betroffen – sie
            liegen unverändert im Ordner.
          </p>
          <pre>{error.message}</pre>
          <button onClick={this.reset}>Nochmal versuchen</button>
        </div>
      </div>
    )
  }
}
