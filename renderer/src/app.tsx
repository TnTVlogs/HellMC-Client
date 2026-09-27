import { route } from './router'
import { t } from './i18n'
import { Shell } from './components/Shell'
import { Home } from './views/Home'
import { Placeholder } from './views/Placeholder'
import { Settings } from './views/Settings'

/** 06 §12 pas 1-2: shell (barra de títol + barra lateral, 08 §8) + router (06 §7). Encara amb
 * dades mock (`window.hellmc`) i vistes de contingut placeholder fora d'Inici. */
export function App() {
  let view
  switch (route.value.name) {
    case 'servers':
      view = <Placeholder title={t('nav.servers')} />
      break
    case 'versions':
      view = <Placeholder title={t('nav.versions')} />
      break
    case 'news':
      view = <Placeholder title={t('nav.news')} />
      break
    case 'settings':
      view = <Settings />
      break
    default:
      view = <Home />
  }

  return <Shell>{view}</Shell>
}
