import { defineConfig, devices } from '@playwright/test'

/*
 * Gravação da demonstração do sistema, para a apresentação em sala.
 *
 * Roda contra a MESMA pilha de teste dos 48 cenários (nunca produção), com o
 * navegador em câmera lenta e vídeo ligado. Não é teste: é um roteiro que
 * passa pelas telas na ordem em que se apresenta, deixando cada uma na tela
 * tempo suficiente para quem assiste ler.
 *
 *   npx playwright test --config playwright.demo.config.ts
 *   (no ambiente do assistente: e2e/ambiente/rodar-no-sandbox.sh sh 'cd e2e && npx playwright test --config playwright.demo.config.ts')
 */
export default defineConfig({
  testDir: './demo',
  timeout: 240_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './fixtures/setup-global.ts',
  outputDir: './demo/saida',
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:5173',
    storageState: '.auth/estado.json',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    video: { mode: 'on', size: { width: 1440, height: 900 } },
    launchOptions: { slowMo: 250 },
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
})
