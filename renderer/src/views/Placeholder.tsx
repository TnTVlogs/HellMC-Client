import { t } from '../i18n'
import { Card } from '../components/Card'

/** Vista temporal per a pestanyes encara no construïdes (2.2–2.5, 09-fases-i-proves.md). */
export function Placeholder({ title }: { title: string }) {
  return (
    <Card>
      <h1 style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h1>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: 'var(--space-2) 0 0' }}>
        {t('placeholder.comingSoon')}
      </p>
    </Card>
  )
}
