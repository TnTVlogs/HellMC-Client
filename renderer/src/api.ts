import type { Distribution } from 'hellmc-distribution-types'

// Tipus de la interfície de `window.hellmc` (06 §5). El preload real (`src-node/preload.js`, de
// moment un mock) i aquest fitxer s'han de mantenir en sincronia manualment: no hi ha `.d.ts`
// compartit encara perquè el preload és JS, no TS (06 diu «tipada (`api.ts` + `.d.ts` compartit)»
// — pendent quan es reescrigui el preload en TS).

export type Unsubscribe = () => void

export interface ClientConfig {
  ui: {
    theme: 'system' | 'dark' | 'light'
    performance: 'auto' | 'on' | 'off'
    uiScale: number
    sidebarCollapsed: boolean
    language: 'en' | 'es' | 'ca'
    /** 07 §6 «Launcher»: mode desenvolupador, ocult per defecte (es revela clicant la versió a
     * Sobre uns quants cops) — el valor persisteix igual de normal, només la UI que el mostra es
     * manté amagada fins que es desbloqueja. */
    devMode: boolean
  }
}

/** 2.3: forma real (`configmanager.js` `javaConfig[versionId]`) — abans `Record<string, unknown>`
 * opac perquè encara no s'havia implementat res al darrere. */
export interface VersionSettings {
  minRAM: string
  maxRAM: string
  executable: string | null
  jvmOptions: string[]
}

/** 2.5 (Configuració > Joc, 07 §6 resta): `ProcessBuilder` ja llegeix tots aquests camps
 * directament de `ConfigManager` (mai rebuts per paràmetre) — persistir-los n'hi ha prou perquè
 * el proper «Jugar» els faci servir, no calen canvis a `launch.start`. */
export interface GameSettings {
  resWidth: number
  resHeight: number
  fullscreen: boolean
  autoConnect: boolean
  launchDetached: boolean
  /** Només lectura efectiva aquí (useu `game.pickDataDirectory()` per canviar-la) — resolta un
   * sol cop en arrencar l'app (`DistroAPI.commonDir`/`instanceDir`), canviar-la cal reiniciar. */
  dataDirectory: string
}

export interface Account {
  type: 'microsoft' | 'offline'
  uuid: string
  displayName: string
}

export type AuthStatus = 'ok' | 'expired' | 'offline' | 'invalid'

export interface LaunchProgress {
  phase: string
  percent: number
  message?: string
  error?: { code: string; message: string }
}

/** 2.11: una instància de joc en execució (multi-instància real — diverses versions/servidors
 * poden córrer alhora, `id` = `versionId::serverId`). */
export interface RunningInstance {
  id: string
  versionId: string
  serverId: string | null
  startedAt: number
}

export interface TaskProgress {
  percent: number
  message?: string
}

export interface JavaInfo {
  available: boolean
  path?: string
  version?: string
}

/** 2.5 (Configuració > Java, «versions de Java detectades»): una instal·lació JVM trobada al
 * sistema — a diferència de `JavaInfo` (la millor per a UNA versió concreta), aquesta és
 * purament informativa (llista, sense cap acció d'auto-desar). */
export interface JavaInstallation {
  path: string
  version: string
  vendor: string
}

/** 2.3 (JDK auto-download): fases del handler `hellmc:java-download` — `fetching-jdk` (tria
 * l'asset)/`downloading-java` (percent real)/`extracting-java`/`ready`. */
export interface JavaDownloadProgress {
  phase: 'fetching-jdk' | 'downloading-java' | 'extracting-java' | 'ready'
  percent: number
}

/** 2.3 (D26, 01 §3.1.1): `forced` reflecteix l'admin (`Version.dataSharing === 'forcedSeparate'`) —
 * quan és cert la UI no mostra l'interruptor (07 §4.4), `shared` ja és `false` igualment. */
export interface DataSharingPreference {
  shared: boolean
  forced: boolean
}

/** 07 §6.2: arrel global de les dades compartides — `hellmc` (per defecte, carpeta pròpia) o
 * `system` (`.minecraft` real de l'usuari, com Lunar Client). Aplica a totes les versions `shared`
 * alhora, no és per versió (06 §8.2). */
export interface DataSharingRoot {
  mode: 'hellmc' | 'system'
  path: string
}

/** 07 §4.2 pt.2 / `docs/mod-dependency-groups`: un mod de primer nivell (ForgeMod/LiteMod/
 * LiteLoader/FabricMod) d'una versió. `key` és l'identificador versionless (`grup:artefacte`, clau
 * de persistència a `ConfigManager`/DOM antic); `id` és el complet, amb versió (clau del graf de
 * dependències — `Module.dependencies` hi apunta amb l'id complet, mai el versionless). */
export interface ModInfo {
  id: string
  key: string
  name: string
  required: boolean
  dependencies: string[]
}

export interface NewsItem {
  id: string
  title: string
  date: number
  url: string
  summary?: string
  author?: string
  /** HTML complet de l'article (07 §5, lector), sanititzat pel renderer abans de pintar-lo — mai
   * cru. Cau a `summary` quan el feed no en dona (`normalizeFeedItem`, `index.js`). */
  content: string
}

/** 07 §5: origen d'un article a l'arxiu — `id: 'global'` o l'id d'un servidor amb `rss` propi.
 * `name: null` per al global (la UI hi posa la seva pròpia etiqueta traduïda, mai un text fix
 * vingut del procés principal). */
export interface NewsSource {
  id: string
  name: string | null
}

export interface NewsArchiveItem extends NewsItem {
  source: NewsSource
  /** Fals un cop `news.markRead()` s'ha cridat des que es va publicar (07 §5, «no llegit»). */
  unread: boolean
}

export interface NewsArchive {
  items: NewsArchiveItem[]
  sources: NewsSource[]
  fromCache: boolean
  fetchedAt: number
}

/** 2.5: `install()` existeix per si un usuari avançat vol forçar-ho ara mateix, però el flux
 * normal (Discord-style, petició explícita de l'usuari) mai el crida sol — `update-downloaded`
 * no mostra cap avís ni botó forçós; `autoInstallOnAppQuit` (main process) ja instal·la en
 * silenci el proper cop que l'app es tanqui del tot, sense cap assistent NSIS (`oneClick`,
 * `electron-builder.yml`). `download-progress` (`percent`) és nou, només per pintar una barra
 * informativa si cal — no bloqueja res. */
export interface UpdaterEvent {
  type: 'checking-for-update' | 'update-available' | 'update-not-available' | 'download-progress' | 'update-downloaded' | 'error'
  info?: { percent?: number; message?: string; version?: string }
}

export interface Activity {
  details?: string
  state?: string
}

export interface HellMCApi {
  distro: {
    get(): Promise<Distribution>
    refresh(): Promise<{ distribution: Distribution; fromCache: boolean }>
    onChange(cb: (d: Distribution) => void): Unsubscribe
  }
  config: {
    get(): Promise<ClientConfig>
    set(patch: Partial<ClientConfig>): Promise<void>
    getVersion(versionId: string): Promise<VersionSettings>
    setVersion(versionId: string, patch: Partial<VersionSettings>): Promise<void>
  }
  /** 2.5: no existia al disseny original (06 §5) — calia un lloc per a la resta de «Joc» (07 §6)
   * que `config` (bloc `ui`) no cobria. */
  game: {
    get(): Promise<GameSettings>
    set(patch: Partial<Omit<GameSettings, 'dataDirectory'>>): Promise<void>
    /** Obre el selector natiu de carpeta; `null` si l'usuari cancel·la. Reiniciar l'app aplica el
     * canvi (`commonDir`/`instanceDir` es resolen un sol cop en arrencar). */
    pickDataDirectory(): Promise<string | null>
  }
  auth: {
    /** 2.1: canviat d'`Account[]` a aquesta forma perquè el renderer sàpiga quin ja és l'actiu
     * sense haver de dur estat propi en paral·lel (`configmanager.selectedAccount` és la font de
     * veritat, no un flag per compte). */
    accounts(): Promise<{ accounts: Account[]; selectedUuid: string | null }>
    select(uuid: string): Promise<void>
    addMicrosoft(): Promise<Account>
    addOffline(username: string): Promise<Account>
    remove(uuid: string): Promise<void>
    validate(): Promise<{ status: AuthStatus }>
  }
  /** 2.1: no existia al disseny original (06 §5) — calia un lloc per exposar
   * `configmanager.getSelectedServer/Version/LastVersionByServer` (01 §5) via IPC, ja que el
   * preload nou és sandboxed i no pot cridar `configmanager.js` directament. */
  selection: {
    get(): Promise<{ serverId: string | null; versionId: string | null }>
    setVersion(versionId: string): Promise<void>
    setServer(serverId: string | null): Promise<void>
    getLastVersionForServer(serverId: string): Promise<string | undefined>
    setLastVersionForServer(serverId: string, versionId: string): Promise<void>
  }
  launch: {
    start(target: { serverId: string | null; versionId: string }): Promise<void>
    /** 2.11: calia saber QUIN llançament en curs cancel·lar un cop n'hi pot haver més d'un alhora
     * (multi-instància real) — abans no calia cap paràmetre perquè només n'hi podia haver un. */
    cancel(target: { serverId: string | null; versionId: string }): Promise<void>
    onProgress(cb: (p: LaunchProgress) => void): Unsubscribe
  }
  /** 2.11: no existia al disseny original — petició de l'usuari per veure les instàncies de joc
   * obertes (poden ser-ne diverses alhora) i poder-les tancar per la força. */
  instances: {
    list(): Promise<RunningInstance[]>
    kill(id: string): Promise<void>
    onChange(cb: (instances: RunningInstance[]) => void): Unsubscribe
  }
  versions: {
    status(versionId: string): Promise<{ installed: boolean; sizeBytes: number; needsUpdate: boolean; path: string }>
    install(versionId: string): Promise<void>
    verify(versionId: string): Promise<void>
    uninstall(versionId: string): Promise<void>
    onProgress(cb: (versionId: string, p: TaskProgress) => void): Unsubscribe
  }
  java: {
    detect(versionId: string): Promise<JavaInfo>
    pick(): Promise<string | null>
    /** 2.3: baixada automàtica quan `detect` no en troba cap de compatible (landing.js:downloadJava,
     * app antiga). Resol/rebutja en acabar; el progrés en viu ve per `onDownloadProgress`. */
    download(versionId: string): Promise<JavaInfo>
    onDownloadProgress(cb: (versionId: string, p: JavaDownloadProgress) => void): Unsubscribe
    /** 2.5: totes les JVMs trobades al sistema (sense filtrar per cap versió concreta). */
    listInstallations(): Promise<JavaInstallation[]>
    /** 2.5: llavor per a `defaultJavaConfig` en crear l'entrada d'una versió nova — mai toca una
     * versió ja configurada (06 §5 `config.getVersion`/`setVersion` continua sent la font de
     * veritat per versió). */
    getGlobalExecutable(): Promise<string | null>
    setGlobalExecutable(executable: string | null): Promise<void>
  }
  /** 2.3 (D26): no existia al disseny original (06 §5) — mateix motiu que `selection`, calia un lloc
   * per exposar la preferència del jugador (`ConfigManager.dataSharing`, no `Version.dataSharing`
   * de la distribució) via IPC sandboxed. */
  dataSharing: {
    getPreference(versionId: string): Promise<DataSharingPreference>
    setPreference(versionId: string, shared: boolean): Promise<void>
    getRoot(): Promise<DataSharingRoot>
    setRoot(mode: 'hellmc' | 'system'): Promise<void>
  }
  /** 07 §4.2 pt.2 (D1-D6, `docs/mod-dependency-groups`): estat = `{ [key]: boolean }`, mateixa forma
   * que `ConfigManager.getModConfiguration(versionId).mods` (clau versionless, valor booleà o
   * `{value: boolean}` per compatibilitat — normalitzat a booleà abans de tornar-lo, 05-client.md
   * ja ho fa igual a `settings.js`). */
  mods: {
    list(versionId: string): Promise<ModInfo[]>
    getState(versionId: string): Promise<Record<string, boolean>>
    /** Patch, no l'estat sencer: només les claus que han canviat (preserva qualsevol forma
     * existent — p. ex. `subModules` niats — de les que no toca). */
    setState(versionId: string, patch: Record<string, boolean>): Promise<void>
  }
  news: {
    get(scope: { serverId?: string }): Promise<{ items: NewsItem[]; fromCache: boolean; fetchedAt: number }>
    /** 07 §5: tots els orígens alhora (`'global'` + cada servidor amb `rss`), amb `unread` calculat
     * contra l'últim `markRead()`. */
    getArchive(): Promise<NewsArchive>
    /** Marca **tots** els orígens com a vistos ara — cridat després de carregar l'arxiu, mai abans
     * (07 §5: primer es veu què és nou, després es marca com a llegit). */
    markRead(): Promise<void>
  }
  status: {
    ping(address: string): Promise<{ online: boolean; players?: { online: number; max: number }; latencyMs?: number }>
  }
  system: {
    memory(): Promise<{ totalMb: number; freeMb: number }>
    openPath(p: string): Promise<void>
    openExternal(url: string): Promise<void>
    /** 2.5 (Sobre > «Llicències de tercers», D23): `THIRD_PARTY_LICENSES.txt`, mai dins l'asar. */
    openThirdPartyLicenses(): Promise<void>
    platform: 'win32' | 'darwin' | 'linux'
    appVersion: string
  }
  window: {
    minimize(): void
    maximizeToggle(): void
    close(): void
    onMaximizeChange(cb: (m: boolean) => void): Unsubscribe
    /** 08 §8.2: recolora els botons natius de finestra (`titleBarOverlay`, Windows/Linux) perquè
     * segueixin el tema en calent. No fa res a macOS (semàfors natius, sense overlay). */
    setTitleBarOverlay(effectiveTheme: 'dark' | 'light'): void
  }
  updater: {
    check(): Promise<void>
    install(): void
    onEvent(cb: (e: UpdaterEvent) => void): Unsubscribe
  }
  discord: {
    setActivity(a: Activity | null): void
  }
}

declare global {
  interface Window {
    hellmc: HellMCApi
  }
}

export const hellmc: HellMCApi = window.hellmc
