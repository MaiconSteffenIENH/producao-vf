import { defineConfig } from 'vitest/config'

/**
 * Testes de unidade: regra pura, sem banco e sem servidor. Rodam em segundos
 * e não precisam de Postgres nem do Prisma Client gerado — é o feedback rápido
 * enquanto se mexe na matemática de preço ou na conta de saldo.
 *
 * A bateria completa (com banco) é `npm test`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/precificacao.test.ts', 'tests/saldos.test.ts'],
  },
})
