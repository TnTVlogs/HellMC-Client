import { render } from 'preact'
import { App } from './app'
import { hellmc } from './api'
import { loadUiConfig } from './stores/ui'
import './design/tokens.css'
import './design/base.css'
import './design/components.css'

// 08 §8: la barra de títol necessita saber la plataforma (macOS reserva espai pels semàfors
// natius; Windows/Linux ho fa `titleBarOverlay` sol, sense CSS).
document.documentElement.dataset.platform = hellmc.system.platform

render(<App />, document.getElementById('app')!)

// No bloqueja el primer render (06 §6): els signals de `stores/ui` ja tenen valors per defecte;
// això només els corregeix quan `config.get()` respon.
void loadUiConfig()
