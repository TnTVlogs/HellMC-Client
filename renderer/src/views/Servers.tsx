import { useEffect } from 'preact/hooks'
import { t } from '../i18n'
import { Card } from '../components/Card'
import { navigate } from '../router'
import { distro, distroLoading } from '../stores/distro'
import { selectServer } from '../stores/selection'
import { pings, pingServer } from '../stores/status'

// 07 §3.1: graella de targetes grans + targeta especial «Jugar sense servidor» sempre primera.
// Columnes responsives via CSS grid amb `auto-fill`/`minmax` (08 §6) en comptes de breakpoints
// JS — es resol sol en redimensionar, no calen mesures manuals.

function PlayWithoutServerCard() {
  function handleClick() {
    void selectServer(null)
    navigate('#/')
  }
  return (
    <Card interactive onClick={handleClick} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', cursor: 'pointer' }}>
      <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)' }}>{t('servers.playWithoutServer')}</span>
      <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{t('servers.playWithoutServerDesc')}</span>
    </Card>
  )
}

function PingDot({ serverId }: { serverId: string }) {
  const ping = pings.value[serverId]
  if (ping == null || ping.state === 'loading') {
    return <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-faint)', display: 'inline-block' }} />
  }
  const color = ping.online ? 'var(--success)' : 'var(--text-faint)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--fs-xs)', color: 'var(--text-faint)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {ping.online && ping.players != null ? `${ping.players.online}/${ping.players.max}` : null}
    </span>
  )
}

export function Servers() {
  const d = distro.value

  useEffect(() => {
    if (d == null) return
    for (const server of d.servers) {
      void pingServer(server.id, server.address)
    }
  }, [d])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h1 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{t('nav.servers')}</h1>

      {distroLoading.value && <p style={{ color: 'var(--text-muted)' }}>{t('home.loadingDistro')}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
        <PlayWithoutServerCard />
        {d != null && d.servers.length === 0 && !distroLoading.value && (
          <p style={{ color: 'var(--text-muted)' }}>{t('servers.empty')}</p>
        )}
        {d?.servers.map((server) => (
          <Card
            key={server.id}
            interactive
            onClick={() => navigate(`#/servers/${server.id}`)}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)' }}>
                {server.mainServer === true ? '★ ' : ''}{server.name}
              </span>
              <PingDot serverId={server.id} />
            </div>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>{server.description}</span>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-faint)' }}>
              {t('servers.versionsCount', { count: server.versions.length })}
            </span>
          </Card>
        ))}
      </div>
    </div>
  )
}
