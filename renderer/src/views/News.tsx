import { useEffect, useMemo, useState } from 'preact/hooks'
import DOMPurify from 'dompurify'
import { ExternalLink } from 'lucide-preact'
import { t } from '../i18n'
import { language } from '../stores/ui'
import { items, sources, fromCache, fetchedAt, loading, loadArchive, markRead } from '../stores/news'
import { hellmc, type NewsArchiveItem } from '../api'
import { Button } from '../components/Button'
import { Art } from '../components/ui'

// 07 §5: arxiu complet + lector (dues columnes a ≥ 1100 px, llista que obre el lector en estret).
// `stores/news.ts` ja carrega l'arxiu en arrencar (`main.tsx`) perquè el comptador de la barra
// lateral funcioni sense obrir aquesta pestanya primer.

// DOMPurify és una instància compartida amb tot el renderer; el hook és global un cop registrat:
// qualsevol HTML extern sanititzat es beneficia de «només imatges https» i «enllaços segurs».
let sanitizeHooksRegistered = false
function ensureSanitizeHooks() {
  if (sanitizeHooksRegistered) return
  sanitizeHooksRegistered = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src')
      if (src != null && !src.startsWith('https:')) node.removeAttribute('src')
    }
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

const ARTICLE_ALLOWED_TAGS = [
  'a', 'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'figure', 'figcaption',
  'code', 'pre', 'span', 'div', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th'
]

function formatDate(ms: number): string {
  return new Intl.DateTimeFormat(language.value, { dateStyle: 'medium' }).format(new Date(ms))
}

function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat(language.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms))
}

function ArticleReader({ item, onBack }: { item: NewsArchiveItem; onBack: () => void }) {
  ensureSanitizeHooks()
  const html = useMemo(() => DOMPurify.sanitize(item.content, { ALLOWED_TAGS: ARTICLE_ALLOWED_TAGS }), [item.content])

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

      {loading.value && items.value.length === 0 && <p class="muted">{t('news.loading')}</p>}
      {!loading.value && visible.length === 0 && <p class="muted">{t('news.empty')}</p>}

      {visible.length > 0 && (
        <div class={`newsview${reading ? ' reading' : ''}`}>
          <div class="nlist" style={{ display: 'flex', flexDirection: 'column', gap: 2 }} role="list">
            {visible.map((item) => (
              <div key={item.id} class="article-item" role="listitem" tabIndex={0} aria-current={selected?.id === item.id ? 'true' : undefined}
                onClick={() => { setSelectedId(item.id); setReading(true) }} onKeyDown={(e) => { if (e.key === 'Enter') { setSelectedId(item.id); setReading(true) } }}>
                <Art seed={item.id} class="thumb" />
                <div>
                  <h3 class={item.unread ? 'unread' : ''}>{item.title}</h3>
                  <span class="meta">{formatDate(item.date)} · {item.source.name ?? t('news.global')}</span>
                </div>
              </div>
            ))}
          </div>
          {selected != null && <ArticleReader item={selected} onBack={() => setReading(false)} />}
        </div>
      )}
    </>
  )
}
