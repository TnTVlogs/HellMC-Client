import { t } from '../../i18n'
import { Button } from '../../components/Button'
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
const LANGUAGES: Language[] = ['en', 'es', 'ca']
const LANGUAGE_LABELS: Record<Language, string> = { en: 'English', es: 'Español', ca: 'Català' }

/**
 * 07 §6 «Launcher»: idioma/tema/mida/mode rendiment/barra lateral fixada/mode desenvolupador.
 * Tot ja persisteix de veritat (06 §6 store `ui`, 2.5 — abans mock, es perdia a cada reinici).
 * `devMode` segueix «ocult per defecte» (§6): el toggle només apareix si ja està activat o s'ha
 * desbloquejat aquesta sessió (clicar la versió a Sobre, `AboutSection.tsx`).
 */
export function LauncherSection() {
  // Recalculades a cada render (no constants de mòdul) perquè canviar d'idioma es tradueixi a
  // l'instant — mateix bug evitat que ja documenta 2.3 §1quinquies per a aquesta mateixa pantalla.
  const themeLabels: Record<Theme, string> = {
    system: t('settings.launcher.themeSystem'),
    dark: t('settings.launcher.themeDark'),
    light: t('settings.launcher.themeLight')
  }
  const perfLabels: Record<PerformanceMode, string> = {
    auto: t('settings.launcher.performanceAuto'),
    on: t('settings.launcher.performanceOn'),
    off: t('settings.launcher.performanceOff')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: '0 0 var(--space-2)' }}>
              {t('settings.launcher.language')}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {LANGUAGES.map((option) => (
                <Button key={option} variant={language.value === option ? 'secondary' : 'ghost'} size="sm" onClick={() => setLanguage(option)}>
                  {LANGUAGE_LABELS[option]}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: '0 0 var(--space-2)' }}>
              {t('settings.launcher.theme')}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {(Object.keys(themeLabels) as Theme[]).map((option) => (
                <Button key={option} variant={theme.value === option ? 'secondary' : 'ghost'} size="sm" onClick={() => setTheme(option)}>
                  {themeLabels[option]}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: '0 0 var(--space-2)' }}>
              {t('settings.launcher.uiScale')}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {UI_SCALES.map((option) => (
                <Button key={option} variant={uiScale.value === option ? 'secondary' : 'ghost'} size="sm" onClick={() => setUiScale(option)}>
                  {option}%
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: '0 0 var(--space-2)' }}>
              {t('settings.launcher.performance')}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {(Object.keys(perfLabels) as PerformanceMode[]).map((option) => (
                <Button key={option} variant={perfMode.value === option ? 'secondary' : 'ghost'} size="sm" onClick={() => setPerfMode(option)}>
                  {perfLabels[option]}
                </Button>
              ))}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Toggle checked={sidebarCollapsed.value} onChange={setSidebarCollapsed} label={t('settings.launcher.sidebarCollapsed')} />
            <span style={{ color: 'var(--text)' }}>{t('settings.launcher.sidebarCollapsed')}</span>
          </label>

          {(devMode.value || devModeRevealed.value) && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <Toggle checked={devMode.value} onChange={setDevMode} label={t('settings.launcher.devMode')} />
              <span style={{ color: 'var(--text)' }}>{t('settings.launcher.devMode')}</span>
            </label>
          )}
        </div>
      </Card>
    </div>
  )
}
