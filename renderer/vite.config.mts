import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// 06 §4.1: root fora de l'arrel del projecte (aquest paquet és Electron+Node, no un projecte Vite
// pur), rutes relatives perquè es carrega amb `file://` un cop empaquetat, i la sortida fora de
// `dist/` (ja usada per electron-builder).
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [preact()],
  build: {
    outDir: '../renderer-dist',
    emptyOutDir: true,
    // Electron 44 empaqueta Chromium 152 (comprovat amb `process.versions.chrome`); el valor
    // exacte no és crític (esbuild el fa servir només per decidir quina sintaxi pot deixar tal
    // qual), s'ajustarà si canvia la versió d'Electron.
    target: 'chrome152'
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts']
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
