import { useState } from 'preact/hooks'
import { Download, Pause, Trash2 } from 'lucide-preact'
import { t } from '../../i18n'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Banner } from '../../components/ui'
import { navigate } from '../../router'
import { showToast } from '../../stores/toasts'
import { selectedAccount } from '../../stores/account'
import { social, socialAct, socialAvailable, socialBusy, socialConsent, socialError, setSocialEnabled } from '../../stores/social'

/**
 * Configuració › Amics: les dades pròpies d'Amics (pausar, exportar, esborrar; docs/pendents/plans/11-social-f4.md). Abans eren a la pestanya
 * Amics; viuen aquí perquè són ajustos de privacitat, no part del dia a dia.
 */
export function FriendsSection() {
  const s = social.value
  const busy = socialBusy.value
  const [confirmDelete, setConfirmDelete] = useState(false)
  const online = s.phase === 'online'

  async function exportData() {
    const data = await socialAct('export')
    if (data == null || typeof data !== 'object') return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hellmc-amics.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    showToast(t('friends.exported'), { tone: 'ok' })
  }

  const unavailable = selectedAccount.value != null && !socialAvailable.value

  return (
    <section class="spanel">
      <h2>{t('settings.nav.friends')}</h2>
      {unavailable && <Banner tone="info">{t('friends.needMicrosoft')}</Banner>}
      {!unavailable && !socialConsent.value && (
        <Banner tone="info" action={<Button size="sm" onClick={() => navigate('/friends')}>{t('nav.friends')}</Button>}>{t('friends.settingsOff')}</Banner>
      )}
      {socialError.value != null && <Banner tone="warn">{socialError.value}</Banner>}
      <Card>
        <div class="set-row">
          <div class="l"><b>{t('friends.dataTitle')}</b><span>{t('friends.dataHelp')}</span></div>
        </div>
        <div class="set-row">
          <div class="l"><b>{t('friends.pause')}</b></div>
          <Button size="sm" disabled={busy || !socialConsent.value} onClick={() => void setSocialEnabled(false)}><Pause size={16} /> {t('friends.pause')}</Button>
        </div>
        <div class="set-row">
          <div class="l"><b>{t('friends.export')}</b></div>
          <Button size="sm" disabled={busy || !online || !socialConsent.value} onClick={() => void exportData()}><Download size={16} /> {t('friends.export')}</Button>
        </div>
        <div class="set-row">
          <div class="l"><b>{t('friends.delete')}</b></div>
          <Button size="sm" variant="danger" disabled={busy || !online || !socialConsent.value} onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> {t('friends.delete')}</Button>
        </div>
      </Card>
      {confirmDelete && (
        <ConfirmDialog title={t('friends.deleteTitle')} message={t('friends.deleteMessage')} confirmLabel={t('friends.delete')} cancelLabel={t('friends.cancel')}
          onCancel={() => setConfirmDelete(false)} onConfirm={() => { setConfirmDelete(false); void socialAct('delete') }} />
      )}
    </section>
  )
}
