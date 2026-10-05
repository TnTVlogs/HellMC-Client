import { Component, type ComponentChildren } from 'preact'
import { t } from '../i18n'

interface State {
  error: Error | null
}

/** F2: un error de render no ha de deixar la finestra en blanc. Mostra una sortida (tornar a carregar / copiar l'error). */
export class ErrorBoundary extends Component<{ children: ComponentChildren }, State> {
  state: State = { error: null }

  componentDidCatch(error: unknown): void {
    this.setState({ error: error instanceof Error ? error : new Error(String(error)) })
    console.error('[renderer] render error', error)
  }

  render() {
    const { error } = this.state
    if (error == null) return this.props.children
    const details = `${error.message}\n${error.stack ?? ''}`
    return (
      <div class="app-shell" style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>
        <main class="center-screen">
          <section class="card welcome" role="alertdialog" aria-labelledby="eb-title">
            <div>
              <h1 id="eb-title">{t('boot.errorTitle')}</h1>
              <p class="muted" style={{ marginTop: 8 }}>{t('boot.errorBody')}</p>
            </div>
            <button type="button" class="btn primary lg" onClick={() => location.reload()}>{t('boot.retry')}</button>
            <button type="button" class="btn ghost sm" onClick={() => void navigator.clipboard.writeText(details)}>{t('boot.errorCopy')}</button>
          </section>
        </main>
      </div>
    )
  }
}
