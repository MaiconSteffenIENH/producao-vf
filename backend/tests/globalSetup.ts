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
  try {
    execSync('npx prisma db push --force-reset --skip-generate', { stdio: 'inherit', env })
    execSync('npx tsx prisma/seed.ts', { stdio: 'inherit', env })
  } catch {
    throw new Error(
      `Não deu para preparar o banco de teste em ${url.replace(/:[^:@]*@/, ':***@')}.\n\n` +
        'Esta bateria precisa de um Postgres descartável. Duas saídas:\n' +
        '  • suba um:  docker run -d --name vf-teste -e POSTGRES_PASSWORD=vf -p 5433:5432 postgres:16\n' +
        '    e aponte: DATABASE_URL_TESTE="postgresql://postgres:vf@localhost:5433/producao_vf_teste"\n' +
        '  • ou rode só a regra pura, que não precisa de banco:  npm run test:unidade\n',
    )
  }
}
