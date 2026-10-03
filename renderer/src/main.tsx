import { render } from 'preact'
import { App } from './app'
import { hellmc } from './api'
import { loadUiConfig } from './stores/ui'
import { loadDistro } from './stores/distro'
import { loadSelection } from './stores/selection'
import { loadAccounts } from './stores/account'
import { loadInstances } from './stores/instances'
import { loadArchive } from './stores/news'
import { initNetwork } from './stores/network'
import './design/tokens.css'
import './design/base.css'
import './design/components.css'

// 08 §8: la barra de títol necessita saber la plataforma (macOS reserva espai pels semàfors
// natius; Windows/Linux ho fa `titleBarOverlay` sol, sense CSS).
document.documentElement.dataset.platform = hellmc.system.platform

render(<App />, document.getElementById('app')!)

// No bloqueja el primer render (06 §6): els signals de cada store ja tenen valors per defecte
// raonables; això només els corregeix quan les crides responen.
void loadUiConfig()
void loadDistro().then(loadSelection)
void loadAccounts()
void loadInstances()
void loadArchive()
initNetwork()
