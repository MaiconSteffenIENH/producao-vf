import { PrismaClient } from '@prisma/client'

/*
 * AJUSTE DE FLUXO — para um banco que JÁ existe.
 *
 * O seed só monta roteiro de peça que ainda não tem nenhum, senão ele
 * atropelaria o que a Vera arrumou à mão. Então mudança de fluxo em banco vivo
 * precisa deste script.
 *
 * O que ele faz:
 *   1. Tira "Acabamento" de todos os roteiros e desativa a etapa. É rápida
 *      demais para virar parada no quadro — etapa que ninguém registra só
 *      deixa o lote parado na tela sem estar parado no ateliê.
 *   2. Passa "Produção das alças" para o Oleiro. Quem faz corpo e alça é ele;
 *      a equipe entra na colagem.
 *   3. Nas peças com alça, a ordem passa a ser
 *      Produção das alças → Colagem → Secagem → …
 *      A secagem vira a TERCEIRA parada: não adianta secar antes de colar.
 *   4. Renumera o que sobrou, sem buraco.
 *
 * NÃO mexe em lote nem em movimento. Se houver lote parado no Acabamento, o
 * script avisa e NÃO desativa a etapa — mover peça por conta própria seria
 * inventar um registro de produção que ninguém fez.
 *
 * Uso:  npm run ajustar-fluxo
 */

const prisma = new PrismaClient()

const ANTES_DA_SECAGEM = ['Produção das alças', 'Colagem']

async function main() {
  console.log('')
  const acabamento = await prisma.etapa.findUnique({ where: { nome: 'Acabamento' } })
  const secagem = await prisma.etapa.findUnique({ where: { nome: 'Secagem' } })
  const oleiro = await prisma.responsavel.findFirst({ where: { nome: 'Oleiro' } })

  // ── 1. Acabamento sai dos roteiros ──
  if (!acabamento) {
    console.log('  Acabamento já não existe.')
  } else {
    const parados = await prisma.movimentoLote.count({ where: { etapaDestinoId: acabamento.id } })
    const saidas = await prisma.movimentoLote.count({ where: { etapaOrigemId: acabamento.id } })
    const usos = await prisma.roteiroEtapa.count({ where: { etapaId: acabamento.id } })
    const removidos = await prisma.roteiroEtapa.deleteMany({ where: { etapaId: acabamento.id } })
    console.log(`  Acabamento saiu de ${removidos.count} de ${usos} roteiro(s).`)

    if (parados > saidas) {
      console.log(
        `  ATENÇÃO: ainda há peça parada no Acabamento (${parados - saidas} entrada(s) sem saída).`,
      )
      console.log('  A etapa continua ATIVA para você mover esses lotes pelo quadro primeiro.')
    } else {
      await prisma.etapa.update({ where: { id: acabamento.id }, data: { ativo: false } })
      console.log('  Etapa Acabamento desativada (o histórico dela continua guardado).')
    }
  }

  // ── 2. as alças são do oleiro ──
  const alcas = await prisma.etapa.findUnique({ where: { nome: 'Produção das alças' } })
  if (alcas && oleiro && alcas.responsavelPadraoId !== oleiro.id) {
    await prisma.etapa.update({ where: { id: alcas.id }, data: { responsavelPadraoId: oleiro.id } })
    await prisma.roteiroEtapa.updateMany({ where: { etapaId: alcas.id }, data: { responsavelId: oleiro.id } })
    console.log('  "Produção das alças" passou para o Oleiro.')
  }

  // ── 3 e 4. reordena cada roteiro e renumera ──
  // posição desejada de cada etapa de alça: Produção das alças = 0, Colagem = 1
  const posicaoAlca = new Map<string, number>()
  for (const e of await prisma.etapa.findMany({
    where: { nome: { in: ANTES_DA_SECAGEM } },
    select: { id: true, nome: true },
  })) {
    posicaoAlca.set(e.id, ANTES_DA_SECAGEM.indexOf(e.nome))
  }

  const pecas = await prisma.peca.findMany({ select: { id: true, nome: true } })
  let mexidos = 0
  for (const peca of pecas) {
    const linhas = await prisma.roteiroEtapa.findMany({
      where: { pecaId: peca.id },
      orderBy: { ordem: 'asc' },
      select: { id: true, ordem: true, etapaId: true },
    })
    if (linhas.length === 0) continue

    let ordenadas = linhas
    if (secagem && linhas.some((l) => posicaoAlca.has(l.etapaId))) {
      // alça e colagem sobem para a frente, nesta ordem; o resto segue como está
      const daAlca = linhas
        .filter((l) => posicaoAlca.has(l.etapaId))
        .sort((a, b) => posicaoAlca.get(a.etapaId)! - posicaoAlca.get(b.etapaId)!)
      const resto = linhas.filter((l) => !posicaoAlca.has(l.etapaId))
      ordenadas = [...daAlca, ...resto]
    }

    const precisa = ordenadas.some((l, i) => l.ordem !== i + 1)
    if (!precisa) continue

    // duas passadas: ordem tem índice único por peça, e escrever direto colidiria
    await prisma.$transaction(async (tx) => {
      for (const [i, l] of ordenadas.entries()) {
        await tx.roteiroEtapa.update({ where: { id: l.id }, data: { ordem: -(i + 1) } })
      }
      for (const [i, l] of ordenadas.entries()) {
        await tx.roteiroEtapa.update({ where: { id: l.id }, data: { ordem: i + 1 } })
      }
    })
    mexidos++
  }
  console.log(`  ${mexidos} roteiro(s) renumerados.`)

  // ── retrato final ──
  console.log('\nComo ficaram os roteiros:\n')
  for (const peca of pecas) {
    const linhas = await prisma.roteiroEtapa.findMany({
      where: { pecaId: peca.id },
      orderBy: { ordem: 'asc' },
      include: { etapa: { select: { nome: true } } },
    })
    if (linhas.length === 0) continue
    console.log(`  ${peca.nome}: ${linhas.map((l) => l.etapa.nome).join(' → ')}`)
  }
  console.log('')
}

main()
  .catch((e) => {
    console.error('\nFalhou:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
