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
  }
}

export type VersionSettings = Record<string, unknown>

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

export interface TaskProgress {
  percent: number
  message?: string
}

export interface JavaInfo {
  available: boolean
  path?: string
  version?: string
}

export interface NewsItem {
  id: string
  title: string
  date: number
  url: string
  summary?: string
}

export interface UpdaterEvent {
  type: 'checking-for-update' | 'update-available' | 'update-not-available' | 'update-downloaded' | 'error'
  info?: unknown
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
  auth: {
    accounts(): Promise<Account[]>
    select(uuid: string): Promise<void>
    addMicrosoft(): Promise<Account>
    addOffline(username: string): Promise<Account>
    remove(uuid: string): Promise<void>
    validate(): Promise<{ status: AuthStatus }>
  }
  launch: {
    start(target: { serverId: string | null; versionId: string }): Promise<void>
    cancel(): Promise<void>
    onProgress(cb: (p: LaunchProgress) => void): Unsubscribe
  }
  versions: {
    status(versionId: string): Promise<{ installed: boolean; sizeBytes: number; needsUpdate: boolean }>
    install(versionId: string): Promise<void>
    verify(versionId: string): Promise<void>
    uninstall(versionId: string): Promise<void>
    onProgress(cb: (versionId: string, p: TaskProgress) => void): Unsubscribe
  }
  java: {
    detect(versionId: string): Promise<JavaInfo>
    pick(): Promise<string | null>
  }
  news: {
    get(scope: { serverId?: string }): Promise<{ items: NewsItem[]; fromCache: boolean; fetchedAt: number }>
  }
  status: {
    ping(address: string): Promise<{ online: boolean; players?: { online: number; max: number }; latencyMs?: number }>
  }
  system: {
    memory(): Promise<{ totalMb: number; freeMb: number }>
    openPath(p: string): Promise<void>
    openExternal(url: string): Promise<void>
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
