import { useState } from 'preact/hooks'
import { t } from '../i18n'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { NewsList } from '../components/NewsList'
import { distro, distroLoading, distroError } from '../stores/distro'
import { effectiveSelection } from '../stores/selection'
import { accounts, selectedAccount, loadAccounts, selectAccount, addOfflineAccount } from '../stores/account'
import { launch, cancelLaunch, launchProgress, isLaunching } from '../stores/launch'

function AccountPicker() {
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-5)' }}>
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t('home.noAccount')}</p>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <input
          value={username}
          onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
          placeholder={t('home.offlineUsernamePlaceholder')}
          class="input"
          style={{ flex: 1 }}
        />
        <Button type="submit" disabled={busy || username.trim() === ''}>{t('home.addOfflineAccount')}</Button>
      </form>
      {error != null && <p style={{ margin: 0, color: 'var(--danger)' }}>{error}</p>}
    </Card>
  )
}

export function Home() {
  const account = selectedAccount.value
  const selection = effectiveSelection.value
  const progress = launchProgress.value

  const server = selection.serverId != null
    ? distro.value?.servers.find((s) => s.id === selection.serverId) ?? null
    : null
  const version = selection.versionId != null
    ? distro.value?.versions.find((v) => v.id === selection.versionId) ?? null
    : null

  async function handlePlay() {
    if (selection.versionId == null) return
    await launch({ serverId: selection.serverId, versionId: selection.versionId })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h1 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
        {t('home.title')}
      </h1>

      {distroLoading.value && <p style={{ color: 'var(--text-muted)' }}>{t('home.loadingDistro')}</p>}
      {distroError.value != null && <p style={{ color: 'var(--danger)' }}>{distroError.value}</p>}

      {accounts.value.length === 0 && !distroLoading.value && <AccountPicker />}

      {accounts.value.length > 0 && (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>
              {server != null ? server.name : t('home.noServer')}
            </span>
            <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)' }}>
              {version != null ? version.name : t('home.noVersionAvailable')}
            </span>
            {account != null && (
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-faint)' }}>
                {t('home.playingAs', { name: account.displayName })}
              </span>
            )}
          </div>

          {isLaunching.value ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                {t(`home.phase.${progress.phase}`)}{progress.percent > 0 ? ` — ${Math.round(progress.percent)}%` : ''}
              </span>
              <Button variant="secondary" onClick={() => void cancelLaunch()}>{t('home.cancel')}</Button>
            </div>
          ) : (
            <Button
              variant="primary"
              size="lg"
              disabled={version == null}
              onClick={() => void handlePlay()}
              style={{ alignSelf: 'flex-start' }}
            >
              {t('home.play')}
            </Button>
          )}

          {progress.phase === 'error' && progress.error != null && (
            <p style={{ margin: 0, color: 'var(--danger)' }}>{progress.error.message}</p>
          )}

          {accounts.value.length > 1 && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {accounts.value.map((a) => (
                <Button
                  key={a.uuid}
                  variant={a.uuid === account?.uuid ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => void selectAccount(a.uuid).then(loadAccounts)}
                >
                  {a.displayName}
                </Button>
              ))}
            </div>
          )}
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>{t('news.title')}</h2>
        <NewsList />
      </div>
    </div>
  )
}
