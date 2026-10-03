import { useEffect, useState } from 'preact/hooks'
import { t } from '../../i18n'
import { authErrorMessage } from '../../utils/authError'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Avatar, Chip } from '../../components/ui'
import { hellmc, type AuthStatus } from '../../api'
import { accounts, selectedUuid, loadAccounts, selectAccount, addOfflineAccount, removeAccount } from '../../stores/account'

/**
 * 07 §6 «Compte»: comptes Microsoft (afegir/eliminar/seleccionar) + comptes offline (§7.4).
 * Microsoft OAuth: finestra pròpia + intercanvi de codi (`MSFT_OPCODE`, `index.js`).
 */
export function AccountSection() {
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msftBusy, setMsftBusy] = useState(false)
  const [msftError, setMsftError] = useState<string | null>(null)
  // Només es pot validar el compte actiu (`auth.validate`); `null` = encara validant.
  const [activeStatus, setActiveStatus] = useState<AuthStatus | null>(null)

  useEffect(() => {
    void loadAccounts()
    setActiveStatus(null)
    void hellmc.auth.validate().then((r) => setActiveStatus(r.status)).catch(() => setActiveStatus('offline'))
  }, [selectedUuid.value])

  async function handleAdd(event: Event) {
    event.preventDefault()
    if (username.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      await addOfflineAccount(username.trim())
      setUsername('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleAddMicrosoft() {
    setMsftBusy(true)
    setMsftError(null)
    try {
      await hellmc.auth.addMicrosoft()
      await loadAccounts()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // «cancelled» (finestra tancada sense acabar) no és un error a mostrar.
      if (message !== 'cancelled') setMsftError(authErrorMessage(err))
    } finally {
      setMsftBusy(false)
    }
  }

  return (
    <section class="spanel">
      <div class="section-title" style={{ margin: 0 }}>
        <h2>{t('ui.accounts')}</h2><span class="spacer" />
        <Button size="sm" variant="primary" disabled={msftBusy} onClick={() => void handleAddMicrosoft()}>{t('settings.account.microsoftConnect')}</Button>
      </div>
      {msftError != null && <p class="error-text">{msftError}</p>}

      <Card>
        {accounts.value.length === 0 && <p class="muted" style={{ padding: 'var(--space-5)' }}>{t('settings.account.empty')}</p>}
        {accounts.value.map((account) => {
          const active = account.uuid === selectedUuid.value
          return (
            <div key={account.uuid} class="account-row">
              <Avatar name={account.displayName} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{account.displayName}</b>
                <div class="muted small">
                  {account.type === 'microsoft' ? t('settings.account.microsoftTitle') : t('settings.account.offlineTitle')}
                  {active && account.type === 'microsoft' && (
                    <span style={{ color: activeStatus === 'ok' ? 'var(--success)' : activeStatus == null ? undefined : 'var(--warning)' }}>
                      {' · '}{t(`settings.account.status.${activeStatus ?? 'checking'}`)}
                    </span>
                  )}
                </div>
              </div>
              {active
                ? <Chip tone="ok">{t('settings.account.active')}</Chip>
                : <Button size="sm" onClick={() => void selectAccount(account.uuid)}>{t('settings.account.select')}</Button>}
              <Button size="sm" variant="ghost" onClick={() => void removeAccount(account.uuid)}>{t('settings.account.remove')}</Button>
            </div>
          )
        })}
      </Card>

      <h2>{t('settings.account.offlineTitle')}</h2>
      <Card pad>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <input value={username} onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
            placeholder={t('settings.account.offlineUsernamePlaceholder')} class="field" style={{ flex: 1 }} maxLength={16} />
          <Button type="submit" variant="primary" disabled={busy || username.trim() === ''}>{t('settings.account.addOffline')}</Button>
        </form>
        {error != null && <p class="error-text" style={{ marginTop: 'var(--space-2)' }}>{error}</p>}
      </Card>
    </section>
  )
}
