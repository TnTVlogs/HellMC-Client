/** Primer ús real (2.3, mida de versions instal·lades) — carpeta prevista des del pas 1 (06 §3),
 * buida fins ara. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`
}

/** Durada breu per a l'ETA: «40 s», «3 min 20 s», «1 h 5 min» (els segons s'ometen a partir d'una hora). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min${s % 60 > 0 ? ` ${s % 60} s` : ''}`
  const h = Math.floor(m / 60)
  return `${h} h${m % 60 > 0 ? ` ${m % 60} min` : ''}`
}
