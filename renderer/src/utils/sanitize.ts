import DOMPurify from 'dompurify'

// S7: **un sol lloc** que sanititza l'HTML d'origen extern (RSS de notícies, Markdown de la distribució). Llista blanca
// d'etiquetes i atributs (sense `style`, `class`, `id`, `<style>`, `<form>`, `<svg>`…), només `https:`/`mailto:` als enllaços i
// només imatges `https:`. El *hook* es registra **una vegada**, en carregar el mòdul (abans depenia de visitar Notícies).

const ALLOWED_TAGS = [
  'a', 'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ul', 'ol', 'li', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'figure', 'figcaption',
  'code', 'pre', 'span', 'div', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'details', 'summary', 'kbd', 'sub', 'sup'
]
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'align', 'width', 'height']

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src')
    if (src == null || !/^https:/i.test(src)) node.removeAttribute('src')
    node.setAttribute('loading', 'lazy')
    node.setAttribute('referrerpolicy', 'no-referrer')
  }
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

export function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i
  })
}
