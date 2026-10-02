import { useEffect, useState } from 'preact/hooks'
import { t } from '../i18n'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { NewsList } from '../components/NewsList'
import { navigate } from '../router'
import { distro } from '../stores/distro'
import { selectServer, selectVersion } from '../stores/selection'
import { launch } from '../stores/launch'
import { hellmc } from '../api'
import { pings, pingServer } from '../stores/status'

// 07 §3.2: detall del servidor — descripció, desplegable de versions (recomanada marcada), Jugar.
// El progrés de llançament es mostra a la targeta Jugar d'Inici (no es duplica aquí, 06 §6 store
// `launch` és compartit): «Jugar» selecciona + navega a Inici, on ja hi ha tota la UI de progrés.

export function ServerDetail({ id }: { id: string }) {
  const d = distro.value
  const server = d?.servers.find((s) => s.id === id) ?? null
  const [versionId, setVersionId] = useState<string | null>(null)

  useEffect(() => {
    if (server == null) return
    void pingServer(server.id, server.address)
    hellmc.selection.getLastVersionForServer(server.id).then((stored) => {
      if (stored != null && server.versions.some((v) => v.id === stored)) {
        setVersionId(stored)
        return
      }
      const recommended = server.versions.find((v) => v.recommended === true) ?? server.versions[0]
      setVersionId(recommended?.id ?? null)
    })
    // Depèn només de `server?.id` (no de `server` sencer): recalcular en cada nou objecte
    // `distro` (que canvia de referència en cada refresc) reobriria el desplegable a cada poll.
  }, [server?.id])

  if (d == null) {
    return <p style={{ color: 'var(--text-muted)' }}>{t('home.loadingDistro')}</p>
  }
  if (server == null) {
    return (
      <Card>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t('serverDetail.notFound')}</p>
        <Button variant="secondary" style={{ marginTop: 'var(--space-3)' }} onClick={() => navigate('#/servers')}>
          {t('serverDetail.back')}
        </Button>
      </Card>
    )
  }

  const ping = pings.value[server.id]
  const versionOptions = server.versions
    .map((entry) => ({ entry, version: d.versions.find((v) => v.id === entry.id) }))
    .filter((x): x is { entry: typeof x.entry; version: NonNullable<typeof x.version> } => x.version != null)

  async function handlePlay() {
    if (versionId == null) return
    await selectServer(server!.id)
    await selectVersion(versionId)
    await hellmc.selection.setLastVersionForServer(server!.id, versionId)
    navigate('#/')
    await launch({ serverId: server!.id, versionId })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Button variant="ghost" size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('#/servers')}>
        {t('serverDetail.back')}
      </Button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <h1 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          {server.mainServer === true ? '★ ' : ''}{server.name}
        </h1>
        {ping?.state === 'done' && ping.online && ping.players != null && (
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>
            ● {ping.players.online}/{ping.players.max}{ping.latencyMs != null ? ` · ${ping.latencyMs} ms` : ''}
          </span>
        )}
      </div>

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>{server.description}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }} for="server-version-select">
            {t('serverDetail.version')}
          </label>
          <select
            id="server-version-select"
            class="input"
            value={versionId ?? ''}
            onChange={(e) => setVersionId((e.target as HTMLSelectElement).value)}
          >
            {versionOptions.map(({ entry, version }) => (
              <option key={entry.id} value={entry.id}>
                {version.name}{entry.recommended === true ? ` (${t('serverDetail.recommended')})` : ''}
              </option>
            ))}
          </select>
        </div>

        <Button variant="primary" size="lg" disabled={versionId == null} onClick={() => void handlePlay()} style={{ alignSelf: 'flex-start' }}>
          {t('home.play')}
        </Button>

        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>{server.address}</span>
      </Card>

      {server.rss != null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{t('news.title')}</h2>
          <NewsList serverId={server.id} />
        </div>
      )}
    </div>
  )
}
