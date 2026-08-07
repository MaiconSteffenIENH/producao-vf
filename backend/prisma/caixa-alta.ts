import { PrismaClient } from '@prisma/client'
import { createInterface } from 'node:readline/promises'
import { caixaAlta } from '../src/lib/nomes'

/*
 * SOBE PARA CAIXA ALTA OS NOMES QUE JÁ ESTÃO NO BANCO.
 *
 * O cadastro passou a subir o nome sozinho, mas só quando alguém edita. Sem
 * isto o ateliê fica meio a meio — "PRATO DE PÃO" ao lado de "Bowl Recortado"
 * — que é exatamente a bagunça que a mudança veio resolver.
 *
 * ── O QUE NÃO SOBE, E POR QUÊ ──
 *
 * PAPÉIS. `Papel.nome` é 'gestao', 'producao', 'leitura' — CHAVE, não rótulo.
 * O seed procura por esses textos exatos e o sistema decide permissão por
 * eles. Subir para maiúscula transformaria a chave em outra coisa e o seed
 * criaria papéis duplicados no próximo `npm run seed`.
 *
 * CONTADORES. `Contador.nome` é 'lote', 'queima', 'encomenda' — mesma coisa:
 * é por onde o código acha o contador. Mexer aqui faria o próximo lote nascer
 * L-0001 de novo, em cima dos que já existem.
 *
 * E-MAIL E SENHA. E-mail em caixa alta é feio e atrapalha comparação; senha é
 * hash, e "subir" um hash é destruí-lo.
 *
 * OBSERVAÇÃO E MOTIVO. Texto corrido existe para ser lido depois. O motivo de
 * uma perda em maiúscula é mais difícil de ler justamente quando alguém está
 * tentando entender o que aconteceu.
 *
 * ── COLISÃO ──
 *
 * Todos estes campos têm índice ÚNICO. Se existirem "Bowl" e "bowl", os dois
 * viram "BOWL" e o banco recusa — com a transação inteira voltando atrás. Por
 * isso o script confere ANTES, mostra os pares em conflito e não escreve nada:
 * juntar dois cadastros é decisão de quem conhece o ateliê, não de um script.
 *
 * Uso:
 *   npm run caixa-alta            (mostra o que vai mudar e pergunta)
 *   npm run caixa-alta -- --sim   (não pergunta)
 */

const prisma = new PrismaClient()

/** Tabelas cujo `nome` é RÓTULO — o que a pessoa lê na tela. */
const ALVOS = [
  { rotulo: 'peças', modelo: 'peca' },
  { rotulo: 'esmaltes', modelo: 'cor' },
  { rotulo: 'categorias', modelo: 'categoria' },
  { rotulo: 'etapas', modelo: 'etapa' },
  { rotulo: 'responsáveis', modelo: 'responsavel' },
  { rotulo: 'matérias-primas', modelo: 'materiaPrima' },
  { rotulo: 'canais de venda', modelo: 'canalVenda' },
  { rotulo: 'usuários', modelo: 'usuario' },
] as const

type Linha = { id: string; nome: string }
type Mudanca = { rotulo: string; modelo: string; id: string; de: string; para: string }

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

const tabela = (modelo: string) =>
  (prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<Linha[]>; update: (a: unknown) => Promise<unknown> }>)[
    modelo
  ]

async function main() {
  const semPerguntar = process.argv.includes('--sim')
  console.log(`\nBanco: ${bancoAlvo()}\n`)

  const mudancas: Mudanca[] = []
  const colisoes: string[] = []

  for (const alvo of ALVOS) {
    const linhas = await tabela(alvo.modelo).findMany({ select: { id: true, nome: true } })

    // o destino de cada nome, e quem já ocupa esse destino
    const destino = new Map<string, Linha[]>()
    for (const l of linhas) {
      const novo = caixaAlta(l.nome)
      if (!destino.has(novo)) destino.set(novo, [])
      destino.get(novo)!.push(l)
    }

    for (const [novo, donos] of destino) {
      if (donos.length > 1) {
        colisoes.push(`  ${alvo.rotulo}: ${donos.map((d) => `"${d.nome}"`).join(' e ')} viram "${novo}"`)
        continue
      }
      const [dono] = donos
      if (dono.nome !== novo) {
        mudancas.push({ rotulo: alvo.rotulo, modelo: alvo.modelo, id: dono.id, de: dono.nome, para: novo })
      }
    }
  }

  if (colisoes.length > 0) {
    console.log('NÃO DÁ PARA SEGUIR — nomes que virariam o mesmo texto:\n')
    for (const c of colisoes) console.log(c)
    console.log('\nO campo é único no banco, então os dois não podem coexistir. Junte ou')
    console.log('renomeie um deles pela tela e rode de novo. Nada foi alterado.\n')
    process.exit(1)
  }

  if (mudancas.length === 0) {
    console.log('Todo nome já está em caixa alta. Nada a fazer.\n')
    return
  }

  console.log(`VAI MUDAR ${mudancas.length} nome(s):\n`)
  let atual = ''
  for (const m of mudancas) {
    if (m.rotulo !== atual) {
      atual = m.rotulo
      console.log(`  ── ${atual} ──`)
    }
    console.log(`     "${m.de}"  →  "${m.para}"`)
  }
  console.log('\nNÃO muda: papéis e contadores (são chave, não rótulo), e-mail, senha,')
  console.log('observação e motivo de perda.\n')

  if (!semPerguntar) {
    const leitor = createInterface({ input: process.stdin, output: process.stdout })
    const resposta = await leitor.question('Digite SUBIR para confirmar: ')
    leitor.close()
    if (resposta.trim() !== 'SUBIR') {
      console.log('\nCancelado. Nada foi alterado.\n')
      return
    }
  }

  /*
   * TRANSAÇÃO EM LOTE, NÃO INTERATIVA.
   *
   * A primeira versão abria `$transaction(async (tx) => …)` e mandava um
   * `update` de cada vez. Contra o Neon isso estourou no meio: cada ida e
   * volta até o pooler custa uns 100 ms, 54 nomes passam dos 5 s que a
   * transação interativa do Prisma espera por padrão, e ela morre com
   * "Transaction not found" — nada gravado, o que ao menos foi seguro.
   *
   * A forma em ARRAY manda tudo de uma vez e o servidor executa dentro de um
   * BEGIN/COMMIT só. Não tem relógio de transação interativa correndo, e a
   * garantia continua a mesma: se um update falhar, nenhum vale.
   */
  const escritas = mudancas.map((m) =>
    (prisma as unknown as Record<string, { update: (a: unknown) => Promise<unknown> }>)[m.modelo].update({
      where: { id: m.id },
      data: { nome: m.para },
    }),
  )
  await prisma.$transaction(escritas as never)

  console.log(`\nPronto. ${mudancas.length} nome(s) em caixa alta.`)
  console.log('A busca não muda de comportamento: `nomeBusca` já é minúsculo e sem')
  console.log('acento, então continua encontrando o mesmo que antes.\n')
}

main()
  .catch((e) => {
    console.error('\nFalhou, e nada foi alterado (a transação voltou atrás):')
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
