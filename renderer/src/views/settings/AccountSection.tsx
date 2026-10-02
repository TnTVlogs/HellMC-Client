import { useEffect, useState } from 'preact/hooks'
import { t } from '../../i18n'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { hellmc } from '../../api'
import { accounts, selectedUuid, loadAccounts, selectAccount, addOfflineAccount, removeAccount } from '../../stores/account'

/**
 * 07 §6 «Compte»: comptes Microsoft (afegir/eliminar/seleccionar) + comptes offline (§7.4).
 * Microsoft OAuth (2.5): finestra pròpia + intercanvi de codi, mateix protocol `MSFT_OPCODE` que
 * l'app antiga (`index.js`, `src-node/preload.js`) — mai reimplementat, només exposat via
 * `hellmc.auth.addMicrosoft()`.
 */
export function AccountSection() {
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msftBusy, setMsftBusy] = useState(false)
  const [msftError, setMsftError] = useState<string | null>(null)

  useEffect(() => {
    void loadAccounts()
  }, [])

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
      // «cancelled» (l'usuari ha tancat la finestra sense acabar) no és un error a mostrar.
      if (message !== 'cancelled') setMsftError(message)
    } finally {
      setMsftBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Card>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)' }}>
          {t('settings.account.microsoftTitle')}
        </h2>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Button variant="secondary" disabled={msftBusy} onClick={() => void handleAddMicrosoft()}>
            {t('settings.account.microsoftConnect')}
          </Button>
        </div>
        {msftError != null && <p style={{ color: 'var(--danger)', margin: 'var(--space-2) 0 0' }}>{msftError}</p>}
      </Card>

      <Card>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)' }}>
          {t('settings.account.offlineTitle')}
        </h2>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          <input
            value={username}
            onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
            placeholder={t('settings.account.offlineUsernamePlaceholder')}
            class="input"
            style={{ flex: 1 }}
          />
          <Button type="submit" disabled={busy || username.trim() === ''}>{t('settings.account.addOffline')}</Button>
        </form>
        {error != null && <p style={{ color: 'var(--danger)', margin: 'var(--space-2) 0 0' }}>{error}</p>}
      </Card>

      <Card>
        {accounts.value.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t('settings.account.empty')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {accounts.value.map((account) => {
              const active = account.uuid === selectedUuid.value
              return (
                <div
                  key={account.uuid}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-2) 0',
                    borderBottom: '1px solid var(--border)'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: 'var(--text)' }}>{account.displayName}</span>
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>
                      {account.type === 'microsoft' ? t('settings.account.microsoftTitle') : t('settings.account.offlineTitle')}
                      {active ? ` · ${t('settings.account.active')}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    {!active && (
                      <Button size="sm" variant="ghost" onClick={() => void selectAccount(account.uuid)}>
                        {t('settings.account.select')}
                      </Button>
                    )}
                    <Button size="sm" variant="danger" onClick={() => void removeAccount(account.uuid)}>
                      {t('settings.account.remove')}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
