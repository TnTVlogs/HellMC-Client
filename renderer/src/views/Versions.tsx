import { useEffect } from 'preact/hooks'
import { t } from '../i18n'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { navigate } from '../router'
import { distro, distroLoading } from '../stores/distro'
import { statuses, refreshStatus, install } from '../stores/versions'
import { formatBytes } from '../utils/format'

// 07 §4.1: llistat de totes les versions publicades. Targetes (no taula) — coherent amb
// `Servers.tsx`, i la informació per versió (nom/MC/loader/estat/mida) hi cap bé sense columnes.

export function Versions() {
  const d = distro.value

  useEffect(() => {
    if (d == null) return
    for (const version of d.versions) {
      void refreshStatus(version.id)
    }
  }, [d])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h1 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{t('nav.versions')}</h1>

      {distroLoading.value && <p style={{ color: 'var(--text-muted)' }}>{t('home.loadingDistro')}</p>}
      {d != null && d.versions.length === 0 && !distroLoading.value && (
        <p style={{ color: 'var(--text-muted)' }}>{t('versions.empty')}</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
        {d?.versions.map((version) => {
          const status = statuses.value[version.id]
          return (
            <Card
              key={version.id}
              interactive
              onClick={() => navigate(`#/versions/${version.id}`)}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', cursor: 'pointer' }}
            >
              <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)' }}>{version.name}</span>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                {version.minecraftVersion} · {version.loader}{version.loaderVersion ? ` ${version.loaderVersion}` : ''}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-faint)' }}>
                  {status == null
                    ? '…'
                    : status.installed
                      ? (status.needsUpdate ? t('versions.updateAvailable') : `${t('versions.installed')} · ${formatBytes(status.sizeBytes)}`)
                      : t('versions.notInstalled')}
                </span>
                {status != null && !status.installed && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => { e.stopPropagation(); void install(version.id) }}
                  >
                    {t('versions.install')}
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
