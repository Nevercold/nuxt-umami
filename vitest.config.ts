import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '#imports': fileURLToPath(new URL('./test/mocks/imports.ts', import.meta.url)),
    },
  },
  test: {
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
