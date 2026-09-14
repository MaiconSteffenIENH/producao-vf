import { defineConfig, devices } from '@playwright/test'

/*
 * Os testes rodam contra a pilha inteira (frontend + API + Postgres), nunca
 * contra produção. Quem sobe a pilha:
 *   - na sua máquina: docker compose -f docker-compose.e2e.yml up (README)
 *   - no CI: o job "e2e" do .github/workflows/ci.yml
 *   - no ambiente do assistente: e2e/ambiente/rodar-no-sandbox.sh
 *
 * Um worker só, de propósito: o banco é compartilhado e várias telas somam
 * saldos globais (fila do forno, contagem de avisos). Cada teste cria as
 * próprias peças e lotes, com nome único, para não depender de ordem.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './fixtures/setup-global.ts',
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:5173',
    storageState: '.auth/estado.json',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
})
