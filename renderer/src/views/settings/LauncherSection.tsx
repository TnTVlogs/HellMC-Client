import { t } from '../../i18n'
import { Card } from '../../components/Card'
import { Toggle } from '../../components/Toggle'
import {
  theme, setTheme, type Theme,
  perfMode, setPerfMode, type PerformanceMode,
  uiScale, setUiScale,
  sidebarCollapsed, setSidebarCollapsed,
  language, setLanguage, type Language,
  devMode, setDevMode, devModeRevealed
} from '../../stores/ui'

const UI_SCALES = [85, 100, 115, 130]
const LANGUAGES: Language[] = ['ca', 'es', 'en']
const LANGUAGE_LABELS: Record<Language, string> = { en: 'English', es: 'Español', ca: 'Català' }

/**
 * 07 §6 «Launcher»: idioma/tema/mida/mode rendiment/barra lateral compacta/mode desenvolupador.
 * Tot persisteix (store `ui`). `devMode` és «ocult per defecte»: només apareix si ja està activat o
 * s'ha desbloquejat aquesta sessió (clicar la versió a Sobre).
 */
export function LauncherSection() {
  const themes: [Theme, string][] = [
    ['system', t('settings.launcher.themeSystem')], ['dark', t('settings.launcher.themeDark')], ['light', t('settings.launcher.themeLight')]
  ]
  const perfs: [PerformanceMode, string][] = [
    ['auto', t('settings.launcher.performanceAuto')], ['on', t('settings.launcher.performanceOn')], ['off', t('settings.launcher.performanceOff')]
  ]

  return (
    <section class="spanel">
      <h2>{t('settings.nav.launcher')}</h2>
      <Card>
        <div class="set-row">
          <div class="l"><b>{t('settings.launcher.language')}</b><span>{t('ui.descLanguage')}</span></div>
          <select class="field sm" aria-label={t('settings.launcher.language')} value={language.value}
            onChange={(e) => setLanguage((e.target as HTMLSelectElement).value as Language)}>
            {LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>)}
          </select>
        </div>
        <div class="set-row">
          <div class="l"><b>{t('settings.launcher.theme')}</b><span>{t('ui.descTheme')}</span></div>
          <div class="seg" data-role="theme">
            {themes.map(([v, label]) => <button key={v} type="button" aria-pressed={theme.value === v} onClick={() => setTheme(v)}>{label}</button>)}
          </div>
        </div>
        <div class="set-row">
          <div class="l"><b>{t('settings.launcher.uiScale')}</b><span>{t('ui.descScale')}</span></div>
          <div class="seg">
            {UI_SCALES.map((v) => <button key={v} type="button" aria-pressed={uiScale.value === v} onClick={() => setUiScale(v)}>{v}%</button>)}
          </div>
        </div>
        <div class="set-row">
          <div class="l"><b>{t('settings.launcher.performance')}</b><span>{t('ui.descPerformance')}</span></div>
          <div class="seg">
            {perfs.map(([v, label]) => <button key={v} type="button" aria-pressed={perfMode.value === v} onClick={() => setPerfMode(v)}>{label}</button>)}
          </div>
        </div>
        <div class="set-row">
          <div class="l"><b>{t('settings.launcher.sidebarCollapsed')}</b><span>{t('ui.descSidebar')}</span></div>
          <Toggle checked={sidebarCollapsed.value} onChange={setSidebarCollapsed} label={t('settings.launcher.sidebarCollapsed')} />
        </div>
        {(devMode.value || devModeRevealed.value) && (
          <div class="set-row">
            <div class="l"><b>{t('settings.launcher.devMode')}</b></div>
            <Toggle checked={devMode.value} onChange={setDevMode} label={t('settings.launcher.devMode')} />
          </div>
        )}
      </Card>
    </section>
  )
}
