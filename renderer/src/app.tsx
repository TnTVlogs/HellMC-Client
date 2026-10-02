import { route } from './router'
import { Shell } from './components/Shell'
import { Home } from './views/Home'
import { Settings } from './views/Settings'
import { Servers } from './views/Servers'
import { ServerDetail } from './views/ServerDetail'
import { Versions } from './views/Versions'
import { VersionDetail } from './views/VersionDetail'
import { News } from './views/News'

/** 06 §12 pas 1-2: shell (barra de títol + barra lateral, 08 §8) + router (06 §7). Totes les
 * pestanyes de nivell superior ja són reals; Configuració (2.5) encara és parcial (Aparença + Joc). */
export function App() {
  let view
  switch (route.value.name) {
    case 'servers':
      view = route.value.params.id != null
        ? <ServerDetail id={route.value.params.id} />
        : <Servers />
      break
    case 'versions':
      view = route.value.params.id != null
        ? <VersionDetail id={route.value.params.id} />
        : <Versions />
      break
    case 'news':
      view = <News />
      break
    case 'settings':
      view = <Settings />
      break
    default:
      view = <Home />
  }

  return <Shell>{view}</Shell>
}
