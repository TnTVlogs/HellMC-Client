import { useEffect, useState } from 'preact/hooks'
import { t } from '../../i18n'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Toggle } from '../../components/Toggle'
import { hellmc, type DataSharingRoot, type GameSettings } from '../../api'

/**
 * 07 §6 «Joc» (completa, 2.5): resolució/pantalla completa/autoconnect/launch detached/carpeta de
 * dades + l'arrel de dades compartides (D26, §6.2, ja hi era des de 2.3 §14). `ProcessBuilder` ja
 * llegeix tots aquests camps directament de `ConfigManager` (`api.ts` `GameSettings`) — persistir-
 * los aquí n'hi ha prou, no calia tocar `launch.start`.
 */
function GeneralGameSection() {
  const [settings, setSettings] = useState<GameSettings | null>(null)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')

  useEffect(() => {
    void hellmc.game.get().then((s) => {
      setSettings(s)
      setWidth(String(s.resWidth))
      setHeight(String(s.resHeight))
    })
  }, [])

  async function patch(p: Partial<Omit<GameSettings, 'dataDirectory'>>) {
    await hellmc.game.set(p)
    setSettings((prev) => (prev != null ? { ...prev, ...p } : prev))
  }

  async function handlePickDataDirectory() {
    const dir = await hellmc.game.pickDataDirectory()
    if (dir == null) return
    setSettings((prev) => (prev != null ? { ...prev, dataDirectory: dir } : prev))
  }

  if (settings == null) return null

  return (
    <Card>
      <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
        {t('settings.game.title')}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
        <div>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: '0 0 var(--space-2)' }}>
            {t('settings.game.resolution')}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <input
              class="input"
              type="number"
              min={0}
              aria-label={t('settings.game.width')}
              value={width}
              onInput={(e) => setWidth((e.target as HTMLInputElement).value)}
              onBlur={() => void patch({ resWidth: Number.parseInt(width, 10) })}
              style={{ width: 90 }}
            />
            <span style={{ color: 'var(--text-faint)' }}>×</span>
            <input
              class="input"
              type="number"
              min={0}
              aria-label={t('settings.game.height')}
              value={height}
              onInput={(e) => setHeight((e.target as HTMLInputElement).value)}
              onBlur={() => void patch({ resHeight: Number.parseInt(height, 10) })}
              style={{ width: 90 }}
            />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Toggle checked={settings.fullscreen} onChange={(v) => void patch({ fullscreen: v })} label={t('settings.game.fullscreen')} />
          <span style={{ color: 'var(--text)' }}>{t('settings.game.fullscreen')}</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Toggle checked={settings.autoConnect} onChange={(v) => void patch({ autoConnect: v })} label={t('settings.game.autoConnect')} />
          <span style={{ color: 'var(--text)' }}>{t('settings.game.autoConnect')}</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Toggle checked={settings.launchDetached} onChange={(v) => void patch({ launchDetached: v })} label={t('settings.game.launchDetached')} />
          <span style={{ color: 'var(--text)' }}>{t('settings.game.launchDetached')}</span>
        </label>

        <div>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: '0 0 var(--space-2)' }}>
            {t('settings.game.dataDirectory')}
          </p>
          <p style={{ color: 'var(--text)', margin: '0 0 var(--space-2)', wordBreak: 'break-all' }}>
            {settings.dataDirectory}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void handlePickDataDirectory()}>
            {t('settings.game.dataDirectoryChange')}
          </Button>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)', margin: 'var(--space-2) 0 0' }}>
            {t('settings.game.dataDirectoryRestartHint')}
          </p>
        </div>
      </div>
    </Card>
  )
}

function SharedDataRootSection() {
  const [root, setRoot] = useState<DataSharingRoot | null>(null)

  useEffect(() => {
    void hellmc.dataSharing.getRoot().then(setRoot)
  }, [])

  async function handleChange(mode: 'hellmc' | 'system') {
    await hellmc.dataSharing.setRoot(mode)
    setRoot(await hellmc.dataSharing.getRoot())
  }

  return (
    <Card>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: '0 0 var(--space-2)' }}>
        {t('settings.game.sharedDataRoot')}
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button variant={root?.mode === 'hellmc' ? 'secondary' : 'ghost'} size="sm" onClick={() => void handleChange('hellmc')}>
          {t('settings.game.sharedDataRootHellmc')}
        </Button>
        <Button variant={root?.mode === 'system' ? 'secondary' : 'ghost'} size="sm" onClick={() => void handleChange('system')}>
          {t('settings.game.sharedDataRootSystem')}
        </Button>
      </div>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)', margin: 'var(--space-2) 0 0' }}>
        {t('settings.game.sharedDataRootHelp')}
      </p>
      {root != null && (
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)', margin: 'var(--space-1) 0 0', wordBreak: 'break-all' }}>
          {root.path}
        </p>
      )}
    </Card>
  )
}

export function GameSection() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <GeneralGameSection />
      <SharedDataRootSection />
    </div>
  )
}
