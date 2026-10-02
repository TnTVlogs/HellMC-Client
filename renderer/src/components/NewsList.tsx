import { useEffect, useState } from 'preact/hooks'
import type { NewsItem } from '../api'
import { hellmc } from '../api'
import { t } from '../i18n'
import { Card } from './Card'

export interface NewsListProps {
  /** Sense servidor: només el feed global (07 §2). Amb servidor: global + el propi si en té
   * (07 §3.2 — la secció es queda amagada si el servidor no té `rss`, decidit per la crida
   * tornar una llista buida en aquest cas, no calia distingir "sense feed" de "feed buit"). */
  serverId?: string
}

/** Primer ús real (2.4 bàsic): notícies globals a Inici + del servidor al seu detall. L'arxiu/
 * lector complet (07 §5, «Notícies» com a pestanya pròpia) és fora d'abast d'aquesta sessió. */
export function NewsList({ serverId }: NewsListProps) {
  const [items, setItems] = useState<NewsItem[] | null>(null)
  const [fromCache, setFromCache] = useState(false)

  useEffect(() => {
    let cancelled = false
    setItems(null)
    hellmc.news.get({ serverId }).then((result) => {
      if (cancelled) return
      setItems(result.items)
      setFromCache(result.fromCache)
    })
    return () => { cancelled = true }
  }, [serverId])

  if (items == null) {
    return <p style={{ color: 'var(--text-muted)' }}>{t('news.loading')}</p>
  }
  if (items.length === 0) {
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {fromCache && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-faint)' }}>{t('news.offlineCache')}</span>}
      {items.slice(0, 5).map((item) => (
        <Card
          key={item.id}
          interactive
          style={{ cursor: 'pointer' }}
          onClick={() => void hellmc.system.openExternal(item.url)}
        >
          <span style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text)' }}>{item.title}</span>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-faint)', marginTop: 'var(--space-1)' }}>
            {new Date(item.date).toLocaleDateString()}
          </div>
          {item.summary != null && (
            <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>{item.summary}</p>
          )}
        </Card>
      ))}
    </div>
  )
}
