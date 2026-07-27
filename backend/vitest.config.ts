import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./tests/globalSetup.ts'],
    // banco de teste é compartilhado: um arquivo por vez evita corrida
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
})
