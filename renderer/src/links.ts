// Enllaços fixos de HellMC. Els textos legals els publica la web (HellMC-Client-Web): català a l'arrel, /es/ i /en/ per als altres idiomes.
const WEBSITE = 'https://hellmcclient.sergidalmau.dev'
const PREFIX = { ca: '', es: '/es', en: '/en' } as const

export const LINKS = {
  website: WEBSITE,
  privacy: `${WEBSITE}/privacy/`,
  terms: `${WEBSITE}/terms/`
} as const

/** URL del text legal en l'idioma de la interfície. */
export const legalLink = (kind: 'privacy' | 'terms', lang: keyof typeof PREFIX): string => `${WEBSITE}${PREFIX[lang]}/${kind}/`
