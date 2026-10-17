'use strict'
// Receptor fals per a les proves del transmissor (Node pur, protocol de ReceiverExecutor).
// El comportament depèn de `versionId` del missatge `validate`.
process.on('message', (m) => {
    if (m.action === 'init') return process.send({ response: 'ready' })
    if (m.action === 'validate') {
        if (m.versionId === 'die') return process.exit(3)
        if (m.versionId === 'err') return process.send({ response: 'error', displayable: 'Request received no response (ENOTFOUND).' })
        if (m.versionId === 'hang') return
        process.send({ response: 'validateProgress', percent: 50 })
        return process.send({ response: 'validateComplete', invalidCount: 3 })
    }
    if (m.action === 'download') {
        process.send({ response: 'downloadProgress', percent: 10 })
        console.log('fill: descarregant')
        // No acaba mai: serveix per provar kill() a mig descarregar.
    }
})
