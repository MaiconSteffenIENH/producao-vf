import { PrismaClient } from '@prisma/client'
import { createInterface } from 'node:readline/promises'

/*
 * ZERAR O MOVIMENTO, MANTER O CADASTRO.
 *
 * Para o dia de virar a chave: sai tudo que foi lançado testando — lotes,
 * movimentos, fornadas, encomendas e vendas importadas — e fica de pé tudo que
 * foi CONFIGURADO: peças, roteiros, esmaltes, etapas, responsáveis, categorias,
 * matérias-primas, canais, custos, preços e usuários.
 *
 * Por que apagar e não cancelar em massa: cancelar joga o saldo restante como
 * PERDA, e a perda medida entra na quantidade que o planejamento manda produzir
 * e no custo real da precificação. O ateliê começaria a operar com uma taxa de
 * perda inventada pelos testes — e ninguém desconfiaria do número.
 *
 * Os contadores de código voltam ao zero, senão o primeiro lote de verdade
 * nasceria L-0148 e o histórico começaria parecendo que já perdemos alguma coisa.
 *
 * Uso:
 *   npm run limpar-producao            (pergunta antes)
 *   npm run limpar-producao -- --sim   (não pergunta — para script)
 */

const prisma = new PrismaClient()

/** Mostra o banco alvo sem nunca imprimir a senha. */
function bancoAlvo(): string {
  const url = process.env.DATABASE_URL
  if (!url) return '(DATABASE_URL não definida)'
  try {
    const u = new URL(url)
    return `${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`
  } catch {
    return '(DATABASE_URL ilegível)'
  }
}

async function contar() {
  const [lotes, movimentos, queimas, encomendas, vendas] = await Promise.all([
    prisma.lote.count(),
    prisma.movimentoLote.count(),
    prisma.queima.count(),
    prisma.encomenda.count(),
    prisma.venda.count(),
  ])
  return { lotes, movimentos, queimas, encomendas, vendas }
}

async function main() {
  const semPerguntar = process.argv.includes('--sim')

  const antes = await contar()
  console.log(`\nBanco: ${bancoAlvo()}\n`)
  console.log('VAI APAGAR')
  console.log(`  lotes .............. ${antes.lotes}`)
  console.log(`  movimentos ......... ${antes.movimentos}`)
  console.log(`  fornadas ........... ${antes.queimas}`)
  console.log(`  encomendas ......... ${antes.encomendas}`)
  console.log(`  vendas importadas .. ${antes.vendas}`)
  console.log('\nVAI MANTER')
  console.log('  peças e roteiros, esmaltes, etapas, responsáveis, categorias,')
  console.log('  matérias-primas, canais, custos, preços e usuários.\n')

  const total = Object.values(antes).reduce((s, n) => s + n, 0)
  if (total === 0) {
    console.log('Não há nada de produção para apagar. Saindo sem mexer no banco.')
    return
  }

  if (!semPerguntar) {
    const leitor = createInterface({ input: process.stdin, output: process.stdout })
    const resposta = await leitor.question('Isto não tem volta. Digite APAGAR para confirmar: ')
    leitor.close()
    if (resposta.trim() !== 'APAGAR') {
      console.log('\nCancelado. Nada foi apagado.')
      return
    }
  }

  await prisma.$transaction(async (tx) => {
    // ordem de dentro para fora: filho sai antes do pai, senão a FK barra
    await tx.queimaItem.deleteMany()
    await tx.queima.deleteMany()
    await tx.movimentoLote.deleteMany()
    // lote referencia lote (divisão): apaga primeiro quem nasceu de outro
    await tx.lote.deleteMany({ where: { loteOrigemId: { not: null } } })
    await tx.lote.deleteMany()
    await tx.encomendaItem.deleteMany()
    await tx.encomenda.deleteMany()
    await tx.venda.deleteMany()
    // o próximo lote de verdade tem de ser o L-0001
    await tx.contador.deleteMany({ where: { nome: { in: ['lote', 'queima', 'encomenda'] } } })
  })

  const depois = await contar()
  console.log('\nPronto. Sobrou:')
  console.log(`  lotes ${depois.lotes} · movimentos ${depois.movimentos} · fornadas ${depois.queimas} ·`)
  console.log(`  encomendas ${depois.encomendas} · vendas ${depois.vendas}`)
  console.log('\nOs códigos recomeçam do L-0001.\n')
}

main()
  .catch((e) => {
    console.error('\nFalhou, e nada foi apagado (a transação voltou atrás):')
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
