import { execSync } from 'node:child_process'

/**
 * Prepara o banco de teste UMA vez por rodada: aplica o schema e semeia.
 * `db push --force-reset` deixa a base limpa — a suíte inteira parte do
 * mesmo estado conhecido, então um teste nunca lê sobra de outro.
 */
export default async function setup() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL não definida para os testes.')
  if (!/teste|test/.test(url)) {
    throw new Error(`Recusando rodar testes contra um banco que não parece de teste: ${url}`)
  }

  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, JWT_SECRET: 'segredo-de-teste' }
  execSync('npx prisma db push --force-reset --skip-generate', { stdio: 'inherit', env })
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit', env })
}
