import { render } from 'preact'
import { App } from './app'
import { ErrorBoundary } from './components/ErrorBoundary'
import { hellmc } from './api'
import { loadUiConfig } from './stores/ui'
import { loadDistro } from './stores/distro'
import { loadSelection } from './stores/selection'
import { loadAccounts } from './stores/account'
import { loadInstances } from './stores/instances'
import { loadArchive } from './stores/news'
import { loadLegal } from './stores/legal'
import { initNetwork } from './stores/network'
import './design/tokens.css'
import './design/base.css'
import './design/components.css'

// 08 §8: la barra de títol necessita saber la plataforma (macOS reserva espai pels semàfors
// natius; Windows/Linux ho fa `titleBarOverlay` sol, sense CSS).
document.documentElement.dataset.platform = hellmc.system.platform

render(<ErrorBoundary><App /></ErrorBoundary>, document.getElementById('app')!)

// Informes d'errors (plans/08): el renderer no té xarxa; passa el text al procés principal, que el neteja i decideix si l'envia.
function reportRendererError(error: unknown, fallbackMessage = ''): void {
  try {
    const err = error instanceof Error ? error : null
    hellmc.errors.report({ name: err?.name ?? 'Error', message: err?.message ?? (typeof error === 'string' ? error : fallbackMessage), stack: err?.stack ?? '' })
  } catch {
    /* informar d'un error mai en pot provocar un altre */
  }
}
window.addEventListener('error', (event) => reportRendererError(event.error, event.message))

// F2: cap promesa rebutjada queda sense registrar (abans eren errors invisibles).
window.addEventListener('unhandledrejection', (event) => {
  console.error('[renderer] unhandledrejection', event.reason)
  reportRendererError(event.reason, 'unhandledrejection')
})

// No bloqueja el primer render (06 §6): els signals de cada store ja tenen valors per defecte
// raonables; això només els corregeix quan les crides responen. Cada càrrega té el seu `catch`:
// una que falli no ha d'impedir les altres.
const logFailure = (what: string) => (err: unknown) => console.error(`[renderer] ${what} failed`, err)
void loadUiConfig().catch(logFailure('loadUiConfig'))
void loadDistro().then(loadSelection).catch(logFailure('loadDistro'))
void loadAccounts().catch(logFailure('loadAccounts'))
void loadLegal().catch(logFailure('loadLegal'))
void loadInstances().catch(logFailure('loadInstances'))
void loadArchive().catch(logFailure('loadArchive'))
initNetwork()
