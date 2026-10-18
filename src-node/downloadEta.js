'use strict'
// Estimació del temps restant d'una descàrrega a partir del percentatge (el receptor de hellmc-core només
// informa de percentatges sencers, no de bytes: per això hi ha ETA però no velocitat en MB/s).
// Mitjana mòbil exponencial de la velocitat (% per segon) entre canvis de percentatge.

const ALPHA = 0.3
const MAX_ETA_S = 24 * 3600

function createEtaEstimator() {
    let lastPercent = null
    let lastAt = 0
    let rate = null // % per segon, suavitzat

    return {
        /** Registra una mostra i retorna els segons restants (enter) o `null` si encara no es pot estimar. */
        sample(percent, now = Date.now()) {
            if (typeof percent !== 'number' || !Number.isFinite(percent)) return null
            if (lastPercent == null || percent < lastPercent) {
                // Primera mostra o reinici (p. ex. nova fase): només s'arrenca el rellotge.
                lastPercent = percent
                lastAt = now
                rate = null
                return null
            }
            if (percent === lastPercent) return rate != null && rate > 0 ? toEta(percent, rate) : null
            const dt = (now - lastAt) / 1000
            if (dt > 0) {
                const instant = (percent - lastPercent) / dt
                rate = rate == null ? instant : ALPHA * instant + (1 - ALPHA) * rate
            }
            lastPercent = percent
            lastAt = now
            return rate != null && rate > 0 ? toEta(percent, rate) : null
        },
        reset() {
            lastPercent = null
            lastAt = 0
            rate = null
        }
    }
}

function toEta(percent, rate) {
    if (percent >= 100) return 0
    return Math.min(MAX_ETA_S, Math.max(1, Math.round((100 - percent) / rate)))
}

module.exports = { createEtaEstimator }
