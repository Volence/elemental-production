import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/overlays': 'http://localhost:3001',
    },
    watch: {
      ignored: ['**/release/**', '**/out/**'],
    },
  },
  test: {
    // A local `electron-builder` run leaves release/linux-unpacked/resources/
    // app/{server,overlays}/*.test.js — stale copies that vitest would
    // otherwise run alongside (and confusingly disagree with) the real ones.
    exclude: [...configDefaults.exclude, 'release/**', 'out/**'],
  },
})
