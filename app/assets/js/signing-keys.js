'use strict'
// S1: claus públiques Ed25519 (PEM, SPKI) de confiança per verificar `distribution-v2.json.sig`.
//
// **Buit = la signatura NO s'exigeix** (comportament actual: només HTTPS). Quan el panell/tu comenceu a publicar la `.sig`,
// afegeix aquí la clau pública (`scripts/distribution-signing.js keygen`) i una segona clau de reserva per poder rotar.
// Un cop hi ha claus, un client sense `.sig` vàlida **ignora** la distribució (i fa servir l'última verificada).
//
// ORDRE SEGUR D'ACTIVACIÓ: 1) el panell publica la `.sig` · 2) comprova-la amb `verify` · 3) publica una versió del client
// amb la clau aquí. Els clients antics (sense clau) continuen funcionant igual.
module.exports = [
    `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAwlW+74Qb+M6GVwIIxpRtrO0t+udGf0W62RSgo0220ms=
-----END PUBLIC KEY-----`
]
