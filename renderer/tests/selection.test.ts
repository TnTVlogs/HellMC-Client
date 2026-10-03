import { beforeEach, describe, expect, it } from 'vitest'
import type { Distribution } from 'hellmc-distribution-types'
import { distro } from '../src/stores/distro'
import { effectiveSelection, selectedServerId, selectedVersionId } from '../src/stores/selection'

const version = (id: string) => ({ id, name: id }) as unknown as Distribution['versions'][number]
const server = (id: string, main: boolean, versions: { id: string; recommended?: boolean }[]) =>
  ({ id, name: id, mainServer: main, versions }) as unknown as Distribution['servers'][number]

function setDistro(servers: Distribution['servers'], versions: Distribution['versions']) {
  distro.value = { format: 2, versions, servers } as unknown as Distribution
}

// 06 §6.1: regles de selecció de la targeta Jugar (D18).
describe('selecció per defecte', () => {
  beforeEach(() => {
    selectedServerId.value = null
    selectedVersionId.value = null
  })

  it('primera arrencada: servidor principal + versió recomanada', () => {
    setDistro(
      [server('a', false, [{ id: 'v1' }]), server('main', true, [{ id: 'v1' }, { id: 'v2', recommended: true }])],
      [version('v1'), version('v2')]
    )
    expect(effectiveSelection.value).toEqual({ serverId: 'main', versionId: 'v2' })
  })

  it('principal sense recomanada: la primera versió del servidor', () => {
    setDistro([server('main', true, [{ id: 'v1' }, { id: 'v2' }])], [version('v1'), version('v2')])
    expect(effectiveSelection.value).toEqual({ serverId: 'main', versionId: 'v1' })
  })

  it('sense servidor principal: sense servidor i la primera versió', () => {
    setDistro([server('a', false, [{ id: 'v9' }])], [version('v9'), version('v1')])
    expect(effectiveSelection.value).toEqual({ serverId: null, versionId: 'v9' })
  })

  it('una selecció desada té prioritat sobre el principal', () => {
    setDistro([server('main', true, [{ id: 'v1' }])], [version('v1'), version('v2')])
    selectedServerId.value = null
    selectedVersionId.value = 'v2'
    expect(effectiveSelection.value).toEqual({ serverId: null, versionId: 'v2' })
  })

  it('sense distribució: res seleccionat', () => {
    distro.value = null
    expect(effectiveSelection.value).toEqual({ serverId: null, versionId: null })
  })
})
