import { useEffect, useState } from 'preact/hooks'
import type { Distribution } from 'hellmc-distribution-types'
import { hellmc } from '../api'
import { language, setLanguage, t, type Language } from '../i18n'
import { Button } from '../components/Button'

export function Home() {
  const [distro, setDistro] = useState<Distribution | null>(null)

  useEffect(() => {
    hellmc.distro.get().then(setDistro)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h1 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
        {t('common.hello')}
      </h1>
      <p style={{ fontSize: 'var(--fs-md)', color: 'var(--text-muted)', margin: 0 }}>
        {t('common.helloDesc')}
      </p>
      {distro && (
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
          {t('common.distroSummary', { versions: distro.versions.length, servers: distro.servers.length })}
        </p>
      )}
      <Button variant="primary" size="md" style={{ alignSelf: 'flex-start' }}>
        {t('common.sampleButton')}
      </Button>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {(['en', 'es', 'ca'] as Language[]).map((lang) => (
          <Button key={lang} variant={language.value === lang ? 'secondary' : 'ghost'} size="sm" onClick={() => setLanguage(lang)}>
            {lang.toUpperCase()}
          </Button>
        ))}
      </div>
    </div>
  )
}
