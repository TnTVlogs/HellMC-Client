import { t } from '../i18n'
import { perfMode, setPerfMode, setTheme, theme, type PerformanceMode, type Theme } from '../stores/ui'
import { Button } from '../components/Button'
import { Card } from '../components/Card'

/**
 * Configuració > Aparença (2.5, 09-fases-i-proves.md), avançada aquí per provar de veritat
 * l'store `ui` (06 §6) i que canviar de tema/rendiment es reflecteix a l'instant (`effect()` a
 * `stores/ui.ts`). La resta de Configuració (Compte/Joc/Java/Launcher/Sobre/Actualitzacions)
 * encara no existeix.
 */
export function Settings() {
  // Es recalculen a cada render (no com a constants de mòdul) perquè canviar d'idioma des d'una
  // altra pestanya (Inici, D06 §9) també actualitzi aquestes etiquetes.
  const themeLabels: Record<Theme, string> = {
    system: t('settings.appearance.themeSystem'),
    dark: t('settings.appearance.themeDark'),
    light: t('settings.appearance.themeLight')
  }
  const perfLabels: Record<PerformanceMode, string> = {
    auto: t('settings.appearance.performanceAuto'),
    on: t('settings.appearance.performanceOn'),
    off: t('settings.appearance.performanceOff')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Card>
        <h1 style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          {t('settings.appearance.title')}
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          <div>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: '0 0 var(--space-2)' }}>
              {t('settings.appearance.theme')}
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
              {t('settings.appearance.performance')}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {(Object.keys(perfLabels) as PerformanceMode[]).map((option) => (
                <Button key={option} variant={perfMode.value === option ? 'secondary' : 'ghost'} size="sm" onClick={() => setPerfMode(option)}>
                  {perfLabels[option]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
