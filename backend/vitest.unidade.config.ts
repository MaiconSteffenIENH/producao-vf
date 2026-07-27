import { defineConfig } from 'vitest/config'

/**
 * Testes de unidade: regra pura, sem banco e sem servidor. Rodam em segundos
 * e não precisam de Postgres nem do Prisma Client gerado — é o feedback rápido
 * enquanto se mexe na matemática de preço ou na conta de saldo.
 *
 * A bateria completa (com banco) é `npm test`.
 *
 * A regra é a PASTA, não uma lista de arquivos. A lista fixa que havia aqui já
 * deixou um teste novo passar despercebido: ele existia, o comando dizia
 * "passou", e o arquivo nunca tinha sido executado. Teste que não roda é pior
 * que teste que não existe, porque dá a sensação de cobertura.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unidade/**/*.test.ts'],
  },
})
