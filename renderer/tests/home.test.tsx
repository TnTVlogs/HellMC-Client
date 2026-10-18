import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import type { Distribution } from 'hellmc-distribution-types'
import type { LaunchProgress } from '../src/api'
import { overrideHellmc } from './helpers'
import { t } from '../src/i18n'

// Targeta Jugar (07 §2.2): etiqueta del botó segons l'estat, progrés amb ETA, errors i menú «⋯».
// Es captura el callback de `hellmc.launch.onProgress` abans d'importar els stores (el registren en carregar-se).
let emit: (p: LaunchProgress) => void = () => undefined
const launchStart = vi.fn(() => Promise.resolve())
let status = { installed: true, needsUpdate: false, sizeBytes: 0, path: '' }

const distribution = {
  format: 2,
  versions: [{ id: 'v1', name: 'Vanilla 1.20' }, { id: 'v2', name: 'Pack 1.21' }],
  servers: [{ id: 'srv', name: 'Infern', address: 'play.example.org', mainServer: true, versions: [{ id: 'v1' }, { id: 'v2', recommended: true }] }]
} as unknown as Distribution

let Home: typeof import('../src/views/Home').Home

// `setup.ts` neteja els overrides després de cada prova: es tornen a posar abans de cadascuna.
function applyOverrides() {
  overrideHellmc('launch.onProgress', (cb: (p: LaunchProgress) => void) => { emit = cb; return () => undefined })
  overrideHellmc('launch.start', launchStart)
  overrideHellmc('versions.status', () => Promise.resolve(status))
  overrideHellmc('status.ping', () => Promise.resolve({ online: true, players: { online: 2, max: 10 }, latencyMs: 20 }))
}
beforeEach(applyOverrides)

beforeAll(async () => {
  applyOverrides()
  const distro = await import('../src/stores/distro')
  distro.distro.value = distribution
  ;({ Home } = await import('../src/views/Home'))
})

const target = { versionId: 'v2', serverId: 'srv' }

describe('Home / targeta Jugar', () => {
  it('mostra el servidor, la versió recomanada i el botó Jugar', async () => {
    render(<Home />)
    expect(screen.getByRole('heading', { name: 'Infern' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: t('serverDetail.version') })).toHaveTextContent('Pack 1.21')
    expect(await screen.findByRole('button', { name: new RegExp(t('home.play')) })).toBeEnabled()
  })

  it('versió no instal·lada: «Instal·la i juga»', async () => {
    status = { installed: false, needsUpdate: false, sizeBytes: 0, path: '' }
    render(<Home />)
    expect(await screen.findByRole('button', { name: new RegExp(t('ui.installAndPlay')) })).toBeInTheDocument()
    status = { installed: true, needsUpdate: false, sizeBytes: 0, path: '' }
  })

  it('Jugar crida launch.start amb el destí i passa a «Cancel·la»', async () => {
    render(<Home />)
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(t('home.play')) }))
    await waitFor(() => expect(launchStart).toHaveBeenCalledWith(target))
    expect(await screen.findByRole('button', { name: new RegExp(t('home.cancel')) })).toBeInTheDocument()
  })

  it('descarregant: percentatge i temps restant (ETA) només amb etaSeconds', async () => {
    render(<Home />)
    act(() => emit({ phase: 'downloading', percent: 40, target }))
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.queryByText(t('home.eta', { time: '1 min 15 s' }))).toBeNull()
    act(() => emit({ phase: 'downloading', percent: 40, etaSeconds: 75, target }))
    expect(screen.getByText(t('home.eta', { time: '1 min 15 s' }))).toBeInTheDocument()
    // fora de la fase de descàrrega l'ETA desapareix
    act(() => emit({ phase: 'launching', percent: 100, etaSeconds: 5, target }))
    expect(screen.queryByText(/5 s/)).toBeNull()
  })

  it('error de joc: missatge traduït i detalls plegables', async () => {
    render(<Home />)
    act(() => emit({ phase: 'error', percent: 0, target, error: { code: 'GAME_EXITED', message: 'x', exitCode: 1, details: ['línia 1', 'línia 2'] } }))
    expect(screen.getByText(t('home.errors.GAME_EXITED', { code: 1 }))).toBeInTheDocument()
    expect(screen.getByText(t('settings.about.viewLogs'))).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: new RegExp(t('home.retry')) })).toBeInTheDocument()
  })

  it('NEEDS_NETWORK obre el diàleg de connexió', () => {
    render(<Home />)
    act(() => emit({ phase: 'error', percent: 0, target, error: { code: 'NEEDS_NETWORK', message: 'net' } }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(t('home.needNetworkTitle'))
  })

  it('menú «⋯»: s\'obre amb les tres accions, el servidor es copia al porta-retalls', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    act(() => emit({ phase: 'idle', percent: 0, target }))
    render(<Home />)
    const more = screen.getByRole('button', { name: t('home.more') })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(t('home.menuCopyAddress')) }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('play.example.org'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Esc tanca el menú', () => {
    render(<Home />)
    fireEvent.click(screen.getByRole('button', { name: t('home.more') }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
