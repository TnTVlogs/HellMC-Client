import { expect, test } from '@playwright/test'
import { join } from 'node:path'

// Proves E2E de la interfície sense el joc real ni compte Microsoft: l'app (renderer-dist, construïda amb
// `npm run build:renderer`) es carrega en un Chromium sense capçalera i `window.hellmc` és el doble de `mock-hellmc.js`.
// No substitueixen les proves manuals amb Electron + joc real (docs/pendents/03-redisseny-client.md §6).

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ path: join(__dirname, 'mock-hellmc.js') })
  await page.goto('/')
})

test('arrenca fins a Inici amb el servidor principal', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Servidor E2E' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Version' })).toContainText('E2E 1.20.1')
})

test('Jugar envia launch.start i mostra el progrés amb ETA', async ({ page }) => {
  await page.getByRole('button', { name: /Play/ }).click()
  const started = await page.evaluate(() => (window as any).__e2e.callsTo('launch.start'))
  expect(started[0].args[0]).toEqual({ serverId: 'srv-e2e', versionId: 'v-e2e' })

  await page.evaluate(() => (window as any).__e2e.emit('launch.onProgress', {
    phase: 'downloading', percent: 40, etaSeconds: 75, target: { serverId: 'srv-e2e', versionId: 'v-e2e' }
  }))
  await expect(page.locator('.pc-progress .num').first()).toHaveText('40%')
  await expect(page.getByText('1 min 15 s left')).toBeVisible()
  await expect(page.getByRole('button', { name: /Cancel/ })).toBeVisible()
})

test('el selector propi es maneja amb teclat', async ({ page }) => {
  const select = page.getByRole('combobox', { name: 'Version' })
  await select.focus()
  await select.press('ArrowDown')
  await expect(page.getByRole('listbox')).toBeVisible()
  await select.press('Escape')
  await expect(page.getByRole('listbox')).toBeHidden()
})

test('el menú «⋯» copia l\'adreça i surt un toast', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'More options' }).click()
  await page.getByRole('menuitem', { name: /Copy server address/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Address copied' })).toBeVisible()
})

test('a Servidors, màxim 3 etiquetes per targeta', async ({ page }) => {
  await page.getByRole('button', { name: 'Servers' }).click()
  const card = page.getByRole('link', { name: /Servidor E2E/ })
  await expect(card.locator('.tags .chip')).toHaveCount(4) // 3 + «+1»
})
