'use strict'
// Termes, privacitat, telemetria i informes d'errors (consentiments).
// Mòdul del procés principal d'Electron (abans tot era a index.js). Registra els seus handlers IPC en carregar-se.
const { ipcMain, ConfigManager, CURRENT_TERMS_VERSION, Telemetry, ErrorReports, reportError } = require('./core')


ipcMain.handle('hellmc:legal-get', () => {
    // eslint-disable-next-line no-unused-vars
    const { telemetryId, telemetryForget, crashPromptAt, ...visible } = ConfigManager.getLegal()
    return { currentVersion: CURRENT_TERMS_VERSION, ...visible }
})
ipcMain.handle('hellmc:legal-accept', async (_event, telemetryOptIn, errorReportOptIn) => {
    ConfigManager.setLegal({ termsAcceptedVersion: CURRENT_TERMS_VERSION, acceptedAt: new Date().toISOString(), telemetryOptIn: telemetryOptIn === true, errorReportOptIn: errorReportOptIn === true })
    ConfigManager.save()
    await Telemetry.onConsentChanged()
    await ErrorReports.onConsentChanged()
})
ipcMain.handle('hellmc:legal-set-error-reports', async (_event, value) => {
    if (typeof value !== 'boolean') throw new Error('INVALID_VALUE')
    ConfigManager.setLegal({ errorReportOptIn: value })
    ConfigManager.save()
    await ErrorReports.onConsentChanged()
})
// Errors del renderer (window.onerror / unhandledrejection): arriben com a text pla i es netegen al principal.
ipcMain.on('hellmc:report-error', (_event, payload) => {
    if (payload == null || typeof payload !== 'object') return
    const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')
    reportError('renderer', null, { name: str(payload.name, 200) || 'Error', message: str(payload.message, 2000), stack: str(payload.stack, 32 * 1024) })
})
// Diàleg de fallada greu de l'última vegada (un cop per arrencada): el renderer el demana i respon amb una de les tres opcions.
ipcMain.handle('hellmc:error-prompt-get', () => ErrorReports.getPendingPrompt())
ipcMain.handle('hellmc:error-prompt-answer', async (_event, choice) => {
    if (!['send', 'dismiss', 'never'].includes(choice)) throw new Error('INVALID_VALUE')
    await ErrorReports.answerPrompt(choice)
})
ipcMain.handle('hellmc:legal-set-telemetry', async (_event, value) => {
    if (typeof value !== 'boolean') throw new Error('INVALID_VALUE')
    ConfigManager.setLegal({ telemetryOptIn: value })
    ConfigManager.save()
    await Telemetry.onConsentChanged()
})

module.exports = {

}
