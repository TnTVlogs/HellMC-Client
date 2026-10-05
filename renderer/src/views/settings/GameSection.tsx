import { useEffect, useState } from 'preact/hooks'
import { t } from '../../i18n'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Toggle } from '../../components/Toggle'
import { hellmc, type DataSharingRoot, type GameSettings } from '../../api'

/**
 * 07 §6 «Joc»: resolució/pantalla completa/autoconnect/launch detached/carpeta de dades + l'arrel
 * de dades compartides (D26, §6.2). `ProcessBuilder` ja llegeix aquests camps de `ConfigManager`.
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
    try {
      const dir = await hellmc.game.pickDataDirectory()
      if (dir == null) return
      setSettings((prev) => (prev != null ? { ...prev, pendingDataDirectory: dir === prev.dataDirectory ? null : dir } : prev))
    } catch (err) {
      console.error('[settings] pickDataDirectory failed', err)
    }
  }

  if (settings == null) return null

  return (
    <Card>
      <div class="set-row">
        <div class="l"><b>{t('settings.game.resolution')}</b><span>{t('ui.descResolution')}</span></div>
        <input class="field sm" type="number" min={320} max={16384} style={{ width: 84 }} aria-label={t('settings.game.width')} value={width}
          onInput={(e) => setWidth((e.target as HTMLInputElement).value)} onBlur={() => void patch({ resWidth: Number.parseInt(width, 10) })} />
        <span class="faint">×</span>
        <input class="field sm" type="number" min={320} max={16384} style={{ width: 84 }} aria-label={t('settings.game.height')} value={height}
          onInput={(e) => setHeight((e.target as HTMLInputElement).value)} onBlur={() => void patch({ resHeight: Number.parseInt(height, 10) })} />
      </div>
      <div class="set-row">
        <div class="l"><b>{t('settings.game.fullscreen')}</b><span>{t('ui.descFullscreen')}</span></div>
        <Toggle checked={settings.fullscreen} onChange={(v) => void patch({ fullscreen: v })} label={t('settings.game.fullscreen')} />
      </div>
      <div class="set-row">
        <div class="l"><b>{t('settings.game.autoConnect')}</b><span>{t('ui.descAutoConnect')}</span></div>
        <Toggle checked={settings.autoConnect} onChange={(v) => void patch({ autoConnect: v })} label={t('settings.game.autoConnect')} />
      </div>
      <div class="set-row">
        <div class="l"><b>{t('settings.game.launchDetached')}</b><span>{t('ui.descDetached')}</span></div>
        <Toggle checked={settings.launchDetached} onChange={(v) => void patch({ launchDetached: v })} label={t('settings.game.launchDetached')} />
      </div>
      <div class="set-row">
        <div class="l">
          <b>{t('settings.game.dataDirectory')}</b>
          <span class="num" style={{ wordBreak: 'break-all' }}>{settings.dataDirectory}</span>
          <span style={{ display: 'block', color: 'var(--text-faint)' }}>{t('settings.game.dataDirectoryRestartHint')}</span>
          <span style={{ display: 'block', color: 'var(--text-faint)' }}>{t('settings.game.dataDirectoryNote')}</span>
          {settings.pendingDataDirectory != null && (
            <span class="num" style={{ display: 'block', wordBreak: 'break-all', color: 'var(--warning)' }}>
              {t('settings.game.dataDirectoryPending', { path: settings.pendingDataDirectory })}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button size="sm" onClick={() => void handlePickDataDirectory()}>{t('settings.game.dataDirectoryChange')}</Button>
          {settings.pendingDataDirectory != null && (
            <Button size="sm" variant="primary" onClick={() => void hellmc.game.relaunch()}>{t('settings.game.dataDirectoryRestartNow')}</Button>
          )}
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
      <div class="set-row">
        <div class="l">
          <b>{t('settings.game.sharedDataRoot')}</b>
          <span>{t('settings.game.sharedDataRootHelp')}</span>
          {root != null && <span class="num" style={{ display: 'block', wordBreak: 'break-all', color: 'var(--text-faint)' }}>{root.path}</span>}
        </div>
        <div class="seg">
          <button type="button" aria-pressed={root?.mode === 'hellmc'} onClick={() => void handleChange('hellmc')}>{t('settings.game.sharedDataRootHellmc')}</button>
          <button type="button" aria-pressed={root?.mode === 'system'} onClick={() => void handleChange('system')}>{t('settings.game.sharedDataRootSystem')}</button>
        </div>
      </div>
    </Card>
  )
}

export function GameSection() {
  return (
    <section class="spanel">
      <h2>{t('settings.nav.game')}</h2>
      <GeneralGameSection />
      <SharedDataRootSection />
    </section>
  )
}
