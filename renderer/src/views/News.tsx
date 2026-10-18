import { useEffect, useMemo, useState } from 'preact/hooks'
import { sanitizeRichHtml } from '../utils/sanitize'
import { ExternalLink } from 'lucide-preact'
import { t } from '../i18n'
import { language } from '../stores/ui'
import { items, sources, fromCache, fetchedAt, loading, loadArchive, markRead } from '../stores/news'
import { hellmc, type NewsArchiveItem } from '../api'
import { Button } from '../components/Button'
import { Art } from '../components/ui'
import { Skeleton, SkeletonGroup } from '../components/Skeleton'
import { VirtualList } from '../components/VirtualList'

/** Alçada fixa de cada fila de la llista (necessària per virtualitzar quan l'arxiu és gran, 06 §10). */
const ROW_HEIGHT = 84

// 07 §5: arxiu complet + lector (dues columnes a ≥ 1100 px, llista que obre el lector en estret).
// `stores/news.ts` ja carrega l'arxiu en arrencar (`main.tsx`) perquè el comptador de la barra
// lateral funcioni sense obrir aquesta pestanya primer.

function formatDate(ms: number): string {
  return new Intl.DateTimeFormat(language.value, { dateStyle: 'medium' }).format(new Date(ms))
}

function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat(language.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms))
}

function ArticleReader({ item, onBack }: { item: NewsArchiveItem; onBack: () => void }) {
  const html = useMemo(() => sanitizeRichHtml(item.content), [item.content])

  function handleContentClick(e: MouseEvent) {
    const anchor = (e.target as HTMLElement).closest('a')
    if (anchor?.href != null) {
      e.preventDefault()
      void hellmc.system.openExternal(anchor.href)
    }
  }

  return (
    <article class="card reader">
      <Art seed={item.id} />
      <div class="rb">
        <div>
          <button type="button" class="link-btn reader-back" onClick={onBack}>← {t('news.back')}</button>
          <span class="meta">{formatDate(item.date)} · {item.source.name ?? t('news.global')}{item.author != null ? ` · ${item.author}` : ''}</span>
          <h1 style={{ marginTop: 6, fontSize: 'var(--fs-2xl)', letterSpacing: '-.02em' }}>{item.title}</h1>
        </div>
        {/* Sanititzat amb DOMPurify (llista blanca d'etiquetes, imatges https només) just a sobre. */}
        <div class="prose markdown-body" style={{ maxWidth: 'none' }} onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: html }} />
        <div>
          <Button size="sm" onClick={() => void hellmc.system.openExternal(item.url)}><ExternalLink size={16} /> {t('news.openWeb')}</Button>
        </div>
      </div>
    </article>
  )
}

export function News() {
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // En estret (< 1100 px) la llista i el lector no caben junts: en triar un article, el lector la substitueix.
  const [reading, setReading] = useState(false)

  useEffect(() => {
    if (items.value.length === 0 && !loading.value) void loadArchive()
    // Marca com a llegit en **sortir** de la pestanya (07 §5): mentre hi és encara ha de veure quins
    // articles eren nous.
    return () => { void markRead() }
  }, [])

  const visible = filter === 'all' ? items.value : items.value.filter((i) => i.source.id === filter)
  const selected = visible.find((i) => i.id === selectedId) ?? visible[0] ?? null

  return (
    <>
      <div class="page-head">
        <div class="grow">
          <h1>{t('news.title')}</h1>
          {fetchedAt.value != null && (
            <p>{fromCache.value ? t('news.offlineBanner', { date: formatDateTime(fetchedAt.value) }) : t('ui.lastUpdate', { date: formatDateTime(fetchedAt.value) })}</p>
          )}
        </div>
        {sources.value.length > 1 && (
          <div class="seg" role="group" aria-label={t('ui.source')}>
            <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t('news.filterAll')}</button>
            {sources.value.map((s) => (
              <button key={s.id} type="button" aria-pressed={filter === s.id} onClick={() => setFilter(s.id)}>{s.name ?? t('news.global')}</button>
            ))}
          </div>
        )}
        <Button size="sm" variant="ghost" disabled={loading.value} onClick={() => void loadArchive()}>{t('news.refresh')}</Button>
      </div>

      {loading.value && items.value.length === 0 && (
        <SkeletonGroup label={t('news.loading')} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              <Skeleton width={64} height={48} radius={8} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}><Skeleton width="80%" height={16} /><Skeleton width="35%" height={12} /></div>
            </div>
          ))}
        </SkeletonGroup>
      )}
      {!loading.value && visible.length === 0 && <p class="muted">{t('news.empty')}</p>}

      {visible.length > 0 && (
        <div class={`newsview${reading ? ' reading' : ''}`}>
          <VirtualList class="nlist" items={visible} rowHeight={ROW_HEIGHT} gap={2} getKey={(item) => item.id}
            renderItem={(item, _i, a11y) => (
              <div class="article-item" role="listitem" tabIndex={0} aria-current={selected?.id === item.id ? 'true' : undefined} {...a11y}
                style={{ height: ROW_HEIGHT, boxSizing: 'border-box', overflow: 'hidden', alignItems: 'center' }}
                onClick={() => { setSelectedId(item.id); setReading(true) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(item.id); setReading(true) } }}>
                <Art seed={item.id} class="thumb" />
                <div style={{ minWidth: 0 }}>
                  <h3 class={item.unread ? 'unread' : ''} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.title}</h3>
                  <span class="meta">{formatDate(item.date)} · {item.source.name ?? t('news.global')}</span>
                </div>
              </div>
            )} />
          {selected != null && <ArticleReader item={selected} onBack={() => setReading(false)} />}
        </div>
      )}
    </>
  )
}
