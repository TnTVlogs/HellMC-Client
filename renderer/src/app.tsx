import { route } from './router'
import { Shell } from './components/Shell'
import { Home } from './views/Home'
import { Settings } from './views/Settings'
import { Servers } from './views/Servers'
import { ServerDetail } from './views/ServerDetail'
import { Versions } from './views/Versions'
import { VersionDetail } from './views/VersionDetail'
import { News } from './views/News'
import { Loading, NeedNetwork, UpdateRequired } from './views/Boot'
import { Welcome } from './views/Welcome'
import { Terms } from './views/Terms'
import { legalLoaded, needsTerms } from './stores/legal'
import { clientOutdated, distro, distroLoading } from './stores/distro'
import { accounts, accountsLoaded } from './stores/account'

/** 06 §12 pas 1-2: shell (barra de títol + barra lateral, 08 §8) + router (06 §7). Totes les
 * pestanyes de nivell superior ja són reals; Configuració (2.5) encara és parcial (Aparença + Joc). */
export function App() {
  // 07 §8 (2.6): flux inicial abans del Shell — càrrega, «Connecta't per començar» (sense
  // distribució ni cache), benvinguda/login (cap compte configurat).
  if (distroLoading.value || !accountsLoaded.value || !legalLoaded.value) return <Loading />
  // D15: termes i privacitat primer (primera execució o textos actualitzats); amb sessió ja iniciada no hi ha login.
  if (needsTerms.value) return <Terms />
  if (distro.value == null) return <NeedNetwork />
  if (clientOutdated.value) return <UpdateRequired />
  if (accounts.value.length === 0) return <Welcome />

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
