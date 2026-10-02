import { useEffect, useMemo, useState } from 'preact/hooks'
import DOMPurify from 'dompurify'
import { t } from '../i18n'
import { language } from '../stores/ui'
import { items, sources, fromCache, fetchedAt, loading, loadArchive, markRead } from '../stores/news'
import { hellmc, type NewsArchiveItem } from '../api'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Tabs } from '../components/Tabs'

// 07 §5: arxiu complet + lector. `stores/news.ts` ja carrega l'arxiu en arrencar l'app (`main.tsx`)
// perquè el comptador de la barra lateral funcioni sense obrir aquesta pestanya primer — aquí només
// es rellegeix el store i es filtra/pinta.

// DOMPurify és una instància **compartida** amb tot el renderer (VersionDetail.tsx també la fa
// servir per al changelog) — aquest hook és global un cop registrat, no només d'aquesta vista.
// Intencionat: qualsevol HTML extern sanititzat a l'app es beneficia igual de «només imatges https»
// i «enllaços amb target/rel segurs» (07 §5), no calia dur el mateix hook a dos llocs.
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Button variant="ghost" size="sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>{t('news.back')}</Button>
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h1 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{item.title}</h1>
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>
          {formatDate(item.date)}
          {item.author != null ? ` · ${item.author}` : ''}
          {' · '}{item.source.name ?? t('news.global')}
        </span>
        {/* Sanititzat amb DOMPurify (llista blanca d'etiquetes, imatges https només) just abans —
            mai HTML cru de l'RSS sense passar-hi. */}
        <div class="markdown-body" onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: html }} />
        <Button variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => void hellmc.system.openExternal(item.url)}>
          {t('news.openWeb')}
        </Button>
      </Card>
    </div>
  )
}

export function News() {
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<NewsArchiveItem | null>(null)

  useEffect(() => {
    if (items.value.length === 0 && !loading.value) void loadArchive()
    // Marca com a llegit en **sortir** de la pestanya, no en entrar-hi (07 §5): mentre el jugador
    // hi és, encara ha de poder veure quins articles eren nous; el comptador de la barra només
    // s'ha de buidar quan de veritat ha acabat de mirar-los.
    return () => { void markRead() }
  }, [])

  const tabItems = [
    { id: 'all', label: t('news.filterAll') },
    ...sources.value.map((s) => ({ id: s.id, label: s.name ?? t('news.global') }))
  ]
  const visible = filter === 'all' ? items.value : items.value.filter((i) => i.source.id === filter)

  if (selected != null) {
    return <ArticleReader item={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{t('news.title')}</h1>
        <Button variant="ghost" size="sm" disabled={loading.value} onClick={() => void loadArchive()}>
          {t('news.refresh')}
        </Button>
      </div>

      {tabItems.length > 1 && <Tabs active={filter} onChange={setFilter} items={tabItems} />}

      {fromCache.value && fetchedAt.value != null && (
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>
          {t('news.offlineBanner', { date: formatDate(fetchedAt.value) })}
        </span>
      )}

      {loading.value && items.value.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>{t('news.loading')}</p>
      )}

      {!loading.value && visible.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>{t('news.empty')}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {visible.map((item) => (
          <Card key={item.id} interactive style={{ cursor: 'pointer' }} onClick={() => setSelected(item)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {item.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
              <span style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text)' }}>{item.title}</span>
            </div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-faint)', marginTop: 'var(--space-1)' }}>
              {formatDate(item.date)}
              {item.author != null ? ` · ${item.author}` : ''}
              {' · '}{item.source.name ?? t('news.global')}
            </div>
            {item.summary != null && (
              <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>{item.summary}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
