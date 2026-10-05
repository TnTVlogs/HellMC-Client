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

// F2: cap promesa rebutjada queda sense registrar (abans eren errors invisibles).
window.addEventListener('unhandledrejection', (event) => {
  console.error('[renderer] unhandledrejection', event.reason)
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
