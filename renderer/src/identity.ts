// Identitat visual per defecte (docs/panel-redesign §3): quan un servidor o una versió no té icona/banner,
// es mostra un degradat de la paleta comuna (g1..g8, `design/components.css`) amb la inicial del nom.
//
// **Còpia idèntica a `HellMC-Client-Panel/frontend/src/identity.ts`** (els vectors de prova de
// `tests/identity.test.ts` han de ser els mateixos als dos repos): el color es deriva del `slug`
// (= `Server.id`/`Version.id` al distribution.json), així un element té sempre el mateix color a tot arreu.

export const GRADIENT_COUNT = 8

/** 1..8, estable per a un mateix `seed`. Els slugs són ASCII, així que el hash és idèntic en qualsevol llenguatge. */
export function gradientIndex(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return (h % GRADIENT_COUNT) + 1
}

export function gradientClass(seed: string): string {
  return `g${gradientIndex(seed)}`
}

export function initialOf(name: string): string {
  return (name.trim().charAt(0) || '?').toUpperCase()
}
