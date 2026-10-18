import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/preact'
import type { Distribution } from 'hellmc-distribution-types'
import { overrideHellmc } from './helpers'
import { t } from '../src/i18n'
import { distro, distroLoading } from '../src/stores/distro'
import { online } from '../src/stores/network'
import { cachedPing, pings, pingServer, POLL_MS, watchPing } from '../src/stores/status'
import { Servers } from '../src/views/Servers'

const distribution = {
  format: 2,
  versions: [{ id: 'v1', name: 'V1' }],
  servers: [{ id: 'srv', name: 'Infern', description: 'd', address: 'play.example.org', mainServer: true, tags: ['a', 'b', 'c', 'd', 'e'], versions: [{ id: 'v1' }] }]
} as unknown as Distribution

const visibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

// Estat de Servidors «fora de línia amb cache» (07 §3.1) i ping només amb pestanya visible (06 §10).
describe('Servers: fora de línia amb cache', () => {
  beforeEach(() => {
    localStorage.clear()
    pings.value = {}
    online.value = true
    visibility('visible')
    distroLoading.value = false
    distro.value = distribution
  })
  afterEach(() => { online.value = true; visibility('visible'); vi.useRealTimers() })

  it('online: fa ping, mostra jugadors i desa la dada a la memòria cau', async () => {
    overrideHellmc('status.ping', () => Promise.resolve({ online: true, players: { online: 3, max: 20 }, latencyMs: 12 }))
    await pingServer('srv', 'play.example.org', { force: true })
    const state = pings.value.srv
    expect(state.state === 'done' && state.online && state.stale !== true).toBe(true)
    expect(cachedPing('srv')).toMatchObject({ online: true, stale: true, players: { online: 3, max: 20 } })
  })

  it('un «no connecta» no trepitja l\'última dada bona', async () => {
    overrideHellmc('status.ping', () => Promise.resolve({ online: true, players: { online: 3, max: 20 } }))
    await pingServer('srv', 'a', { force: true })
    overrideHellmc('status.ping', () => Promise.resolve({ online: false }))
    await pingServer('srv', 'a', { force: true })
    expect(cachedPing('srv')).toMatchObject({ players: { online: 3, max: 20 } })
  })

  it('sense xarxa no fa ping i recupera la dada de cache marcada com a vella', async () => {
    const ping = vi.fn(() => Promise.resolve({ online: false }))
    overrideHellmc('status.ping', () => Promise.resolve({ online: true, players: { online: 7, max: 50 } }))
    await pingServer('srv', 'a', { force: true })
    overrideHellmc('status.ping', ping)
    pings.value = {}
    online.value = false
    await pingServer('srv', 'a', { force: true })
    expect(ping).not.toHaveBeenCalled()
    expect(pings.value.srv).toMatchObject({ state: 'done', stale: true, players: { online: 7, max: 50 } })
  })

  it('una dada de més de 7 dies no es fa servir', async () => {
    overrideHellmc('status.ping', () => Promise.resolve({ online: true, players: { online: 1, max: 2 } }))
    await pingServer('srv', 'a', { force: true })
    expect(cachedPing('srv', Date.now() + 8 * 24 * 3600 * 1000)).toBeNull()
  })

  it('pestanya amagada: no es fa ping (llevat de force)', async () => {
    const ping = vi.fn(() => Promise.resolve({ online: true }))
    overrideHellmc('status.ping', ping)
    visibility('hidden')
    await pingServer('hidden-1', 'a')
    expect(ping).not.toHaveBeenCalled()
    await pingServer('hidden-1', 'a', { force: true })
    expect(ping).toHaveBeenCalledTimes(1)
  })

  it('watchPing: periòdic mentre és visible i es reprèn en tornar a la pestanya; el cleanup atura tot', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const ping = vi.fn(() => Promise.resolve({ online: true }))
    overrideHellmc('status.ping', ping)
    const stop = watchPing('w1', 'a')
    await vi.advanceTimersByTimeAsync(0)
    expect(ping).toHaveBeenCalledTimes(1)

    visibility('hidden')
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(ping).toHaveBeenCalledTimes(1) // amagada: res

    visibility('visible')
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(ping).toHaveBeenCalledTimes(2) // visible i TTL vençut: un altre

    stop()
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(ping).toHaveBeenCalledTimes(2) // sense vigilants no hi ha temporitzador
  })

  it('la vista mostra l\'avís sense xarxa i les dades antigues amb l\'etiqueta «darrer conegut»', async () => {
    overrideHellmc('status.ping', () => Promise.resolve({ online: true, players: { online: 7, max: 50 } }))
    await pingServer('srv', 'play.example.org', { force: true })
    pings.value = {}
    online.value = false
    render(<Servers />)
    expect(screen.getByRole('alert')).toHaveTextContent(t('servers.offlineCache'))
    await waitFor(() => expect(screen.getByText(t('servers.offlineStale'))).toBeInTheDocument())
    expect(screen.getByText('7/50')).toBeInTheDocument()
  })

  it('online: sense avís', () => {
    render(<Servers />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('màxim 3 etiquetes per targeta i resum «+N»', () => {
    render(<Servers />)
    const card = screen.getByRole('link', { name: /Infern/ })
    expect(card.querySelectorAll('.tags .chip')).toHaveLength(4) // 3 + «+2»
    expect(card).toHaveTextContent('+2')
  })

  it('carregant la distribució per primer cop: esquelets amb text per a lectors de pantalla', () => {
    distro.value = null
    distroLoading.value = true
    const { container } = render(<Servers />)
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
    expect(screen.getByRole('status')).toHaveTextContent(t('home.loadingDistro'))
    act(() => { distroLoading.value = false })
  })
})
