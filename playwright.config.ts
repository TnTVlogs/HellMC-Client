import { defineConfig } from '@playwright/test'

// E2E opcional (`npm run test:e2e`): NO forma part de `npm test`. Necessita Chromium de Playwright
// (`npx playwright install chromium`, una sola vegada) i la build del renderer (`npm run build:renderer`).
// Serveix `renderer-dist` amb `vite preview` i hi injecta el doble de `window.hellmc` (e2e/mock-hellmc.js).
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', headless: true, locale: 'en-US' },
  webServer: {
    command: 'npx vite preview --config renderer/vite.config.mts --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000
  }
})
