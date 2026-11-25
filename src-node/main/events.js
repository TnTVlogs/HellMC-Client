'use strict'
// Bus d'esdeveniments entre mòduls del procés principal: evita dependències circulars (un mòdul avisa, qui hi estigui interessat escolta).
//   `account-changed`: s'ha afegit, tret o canviat el compte seleccionat (auth → social).
module.exports = new (require('node:events').EventEmitter)()
