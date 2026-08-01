import { prisma } from '../lib/prisma'
import { saldosPorLote } from './lote.service'
import {
  visaoDasProntas,
  visaoDoBiscoito,
  type EntradaDeBiscoito,
  type EntradaDeProntas,
} from '../lib/estoque'

/**
 * Fotografia do que existe hoje, montada a partir dos saldos dos lotes.
 *
 * Três baldes que o planejamento precisa separar:
 *  - prontos   → etapa do tipo `final`, já com cor
 *  - biscoito  → etapa marcada como `estoqueIntermediario`, ainda SEM cor:
 *                é o pulmão que atende qualquer esmalte
 *  - emProducao→ todo o resto do caminho
 */
export type Estoque = {
  porPeca: Map<string, { prontos: number; biscoito: number; emProducao: number }>
  /** chave `${pecaId}:${corId}` */
  prontosPorCor: Map<string, number>
  /** chave `${pecaId}:${corId}` — já esmaltado mas ainda não pronto */
  emProducaoPorCor: Map<string, number>
}

export async function calcularEstoque(): Promise<Estoque> {
  const [lotes, etapas] = await Promise.all([
    prisma.lote.findMany({
      where: { canceladoEm: null },
      select: { id: true, pecaId: true, corId: true },
    }),
    prisma.etapa.findMany({ select: { id: true, tipo: true, estoqueIntermediario: true } }),
  ])

  const tipoEtapa = new Map<string, { final: boolean; biscoito: boolean }>(
    etapas.map((e: { id: string; tipo: string; estoqueIntermediario: boolean }) => [
      e.id,
      { final: e.tipo === 'final', biscoito: e.estoqueIntermediario },
    ]),
  )

  const saldos = await saldosPorLote(lotes.map((l: { id: string }) => l.id))

  const porPeca = new Map<string, { prontos: number; biscoito: number; emProducao: number }>()
  const prontosPorCor = new Map<string, number>()
  const emProducaoPorCor = new Map<string, number>()

  const acumular = (mapa: Map<string, number>, chave: string, valor: number) =>
    mapa.set(chave, (mapa.get(chave) ?? 0) + valor)

  for (const lote of lotes as { id: string; pecaId: string; corId: string | null }[]) {
    const mapa = saldos.get(lote.id)
    if (!mapa) continue

    const atual = porPeca.get(lote.pecaId) ?? { prontos: 0, biscoito: 0, emProducao: 0 }

    for (const [etapaId, quantidade] of mapa) {
      const tipo = tipoEtapa.get(etapaId)
      if (tipo?.final) {
        atual.prontos += quantidade
        if (lote.corId) acumular(prontosPorCor, `${lote.pecaId}:${lote.corId}`, quantidade)
      } else if (tipo?.biscoito && !lote.corId) {
        // biscoito COM cor já foi comprometido com um esmalte: conta como produção
        atual.biscoito += quantidade
      } else {
        atual.emProducao += quantidade
        if (lote.corId) acumular(emProducaoPorCor, `${lote.pecaId}:${lote.corId}`, quantidade)
      }
    }
    porPeca.set(lote.pecaId, atual)
  }

  return { porPeca, prontosPorCor, emProducaoPorCor }
}

/**
 * Taxa de perda real por peça, medida no livro-razão: perdidas ÷ (perdidas +
 * o que passou pela etapa final). Precisa de amostra mínima, senão um lote
 * azarado de 6 peças vira "50% de perda" e envenena a precificação.
 */
export async function taxasDePerda(minimoAmostra = 30): Promise<Map<string, { taxa: number; amostra: number }>> {
  const [movimentos, etapasFinais] = await Promise.all([
    prisma.movimentoLote.findMany({
      select: { tipo: true, quantidade: true, etapaDestinoId: true, lote: { select: { pecaId: true } } },
    }),
    prisma.etapa.findMany({ where: { tipo: 'final' }, select: { id: true } }),
  ])
  const finais = new Set(etapasFinais.map((e: { id: string }) => e.id))

  const perdas = new Map<string, number>()
  const concluidas = new Map<string, number>()

  for (const m of movimentos as {
    tipo: string
    quantidade: number
    etapaDestinoId: string | null
    lote: { pecaId: string }
  }[]) {
    const peca = m.lote.pecaId
    if (m.tipo === 'perda') perdas.set(peca, (perdas.get(peca) ?? 0) + m.quantidade)
    else if (m.etapaDestinoId && finais.has(m.etapaDestinoId)) {
      concluidas.set(peca, (concluidas.get(peca) ?? 0) + m.quantidade)
    }
  }

  const resultado = new Map<string, { taxa: number; amostra: number }>()
  for (const pecaId of new Set([...perdas.keys(), ...concluidas.keys()])) {
    const perdida = perdas.get(pecaId) ?? 0
    const pronta = concluidas.get(pecaId) ?? 0
    const amostra = perdida + pronta
    if (amostra < minimoAmostra) continue
    resultado.set(pecaId, { taxa: perdida / amostra, amostra })
  }
  return resultado
}

// ═══════════════════ A tela do pulmão: estoque de biscoito ═══════════════════

/*
 * Por que esta consulta não reaproveita `calcularEstoque()`.
 *
 * Aquela função responde "quanto há" em três baldes, e o balde do meio joga
 * junto tudo que não é pronto nem biscoito. Para o pulmão isso não basta: a
 * pergunta da tela é "falta biscoito de quê", e ela só é honesta se souber
 * também o que JÁ ESTÁ A CAMINHO do biscoito — peça sem cor parada antes da 1ª
 * queima. Sem essa distinção o sistema mandaria repor 30 enquanto 40 secam na
 * prateleira ao lado, e o ateliê produziria duas vezes a mesma coisa.
 *
 * Saber isso exige a POSIÇÃO da etapa no roteiro DAQUELA peça — cada peça tem
 * o seu — e é por isso que aqui se lê o roteiro e se soma lote a lote.
 *
 * O saldo continua saindo de `saldosPorLote`: nada aqui é campo gravado.
 */

type PecaDoBiscoito = {
  id: string
  nome: string
  qtdMinimaBiscoito: number
  categoria: { nome: string } | null
  roteiro: { ordem: number; etapa: { id: string; estoqueIntermediario: boolean } }[]
}

type LoteCru = { id: string; pecaId: string; corId: string | null }

export async function estoqueDeBiscoito() {
  const [pecas, lotes] = await Promise.all([
    prisma.peca.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        qtdMinimaBiscoito: true,
        categoria: { select: { nome: true } },
        roteiro: {
          orderBy: { ordem: 'asc' },
          select: { ordem: true, etapa: { select: { id: true, estoqueIntermediario: true } } },
        },
      },
    }),
    prisma.lote.findMany({
      where: { canceladoEm: null },
      select: { id: true, pecaId: true, corId: true },
    }),
  ])

  const saldos = await saldosPorLote((lotes as LoteCru[]).map((l) => l.id))

  /** peça → a etapa de biscoito dela e o ponto do roteiro em que ela fica */
  const biscoitoDaPeca = new Map<string, { etapaId: string; ordem: number }>()
  /** peça → (etapa → ordem), para separar o que vem ANTES do biscoito */
  const ordemNoRoteiro = new Map<string, Map<string, number>>()

  for (const peca of pecas as PecaDoBiscoito[]) {
    const ordens = new Map<string, number>()
    for (const passo of peca.roteiro) {
      ordens.set(passo.etapa.id, passo.ordem)
      // o roteiro vem ordenado: a primeira marcada é a que vale
      if (passo.etapa.estoqueIntermediario && !biscoitoDaPeca.has(peca.id)) {
        biscoitoDaPeca.set(peca.id, { etapaId: passo.etapa.id, ordem: passo.ordem })
      }
    }
    ordemNoRoteiro.set(peca.id, ordens)
  }

  const somado = new Map<string, { emBiscoito: number; aCaminho: number; lotes: Set<string> }>()

  for (const lote of lotes as LoteCru[]) {
    // lote que já escolheu esmalte deixou de ser pulmão: ele tem dono, e contá-lo
    // aqui prometeria a qualquer cor uma peça que já é de uma só
    if (lote.corId) continue
    const saldoDoLote = saldos.get(lote.id)
    const biscoito = biscoitoDaPeca.get(lote.pecaId)
    if (!saldoDoLote || !biscoito) continue

    const ordens = ordemNoRoteiro.get(lote.pecaId)
    const atual = somado.get(lote.pecaId) ?? {
      emBiscoito: 0,
      aCaminho: 0,
      lotes: new Set<string>(),
    }
    for (const [etapaId, quantidade] of saldoDoLote) {
      if (etapaId === biscoito.etapaId) {
        atual.emBiscoito += quantidade
        atual.lotes.add(lote.id)
        continue
      }
      const ordem = ordens?.get(etapaId)
      if (ordem !== undefined && ordem < biscoito.ordem) atual.aCaminho += quantidade
    }
    somado.set(lote.pecaId, atual)
  }

  // peça cujo roteiro não passa por biscoito não tem pulmão para mostrar: uma
  // linha eterna de "0 de 0" só ensinaria a rolar a tela sem ler
  const entradas: EntradaDeBiscoito[] = (pecas as PecaDoBiscoito[])
    .filter((p) => biscoitoDaPeca.has(p.id))
    .map((p) => {
      const total = somado.get(p.id)
      return {
        pecaId: p.id,
        peca: p.nome,
        categoria: p.categoria?.nome ?? null,
        emBiscoito: total?.emBiscoito ?? 0,
        minimo: p.qtdMinimaBiscoito,
        aCaminho: total?.aCaminho ?? 0,
        lotes: total?.lotes.size ?? 0,
      }
    })

  return visaoDoBiscoito(entradas)
}

// ═══════════════════ A tela do fim da linha: peças prontas ═══════════════════

type PecaComNome = { id: string; nome: string }
type CorCrua = { id: string; nome: string; hex: string; malhado: boolean; amostraUrl: string | null }
type CombinacaoCrua = { pecaId: string; corId: string; fotoStatus: string }

/*
 * O estoque pronto, por peça e esmalte, com o que vende separado do que só
 * existe.
 *
 * Duas escolhas que parecem detalhe e não são:
 *
 * 1. A lista NASCE DO SALDO, não do catálogo de peça+cor. Combinação cadastrada
 *    sem nenhuma peça pronta não é estoque — quem lista o catálogo inteiro é a
 *    tela de Fotos.
 * 2. Peça e combinação INATIVAS continuam contando. A peça está na prateleira
 *    independentemente de alguém ter desmarcado a caixinha no cadastro, e um
 *    estoque que esconde peça existente é pior do que não ter estoque nenhum.
 */
export async function estoqueDeProntas() {
  const [pecas, cores, combinacoes, estoque] = await Promise.all([
    prisma.peca.findMany({ select: { id: true, nome: true } }),
    prisma.cor.findMany({
      select: { id: true, nome: true, hex: true, malhado: true, amostraUrl: true },
    }),
    prisma.pecaCor.findMany({ select: { pecaId: true, corId: true, fotoStatus: true } }),
    calcularEstoque(),
  ])

  const nomeDaPeca = new Map((pecas as PecaComNome[]).map((p) => [p.id, p.nome]))
  const esmalte = new Map((cores as CorCrua[]).map((c) => [c.id, c]))
  const fotoDaCombinacao = new Map(
    (combinacoes as CombinacaoCrua[]).map((c) => [`${c.pecaId}:${c.corId}`, c.fotoStatus]),
  )

  const entradas: EntradaDeProntas[] = []
  const prontasComCor = new Map<string, number>()

  for (const [chave, prontas] of estoque.prontosPorCor) {
    const [pecaId, corId] = chave.split(':')
    const peca = nomeDaPeca.get(pecaId)
    if (!peca) continue
    prontasComCor.set(pecaId, (prontasComCor.get(pecaId) ?? 0) + prontas)
    const cor = esmalte.get(corId)
    entradas.push({
      pecaId,
      peca,
      corId,
      cor: cor?.nome ?? null,
      corHex: cor?.hex ?? null,
      malhado: cor?.malhado ?? false,
      amostraUrl: cor?.amostraUrl ?? null,
      prontas,
      aCaminho: estoque.emProducaoPorCor.get(chave) ?? 0,
      // combinação sem linha em PecaCor não tem ciclo de foto nenhum: não é
      // "pendente", é inexistente — e a lógica pura trata as duas como não vendável
      fotoStatus: fotoDaCombinacao.get(chave) ?? null,
    })
  }

  /*
   * O que sobra do total da peça depois de descontar as cores é lote que chegou
   * ao fim SEM esmalte atribuído. Some-lo às cores esconderia peça que existe;
   * jogá-lo em qualquer cor inventaria estoque de um esmalte que ninguém usou.
   */
  for (const [pecaId, saldo] of estoque.porPeca) {
    const semEsmalte = saldo.prontos - (prontasComCor.get(pecaId) ?? 0)
    const peca = nomeDaPeca.get(pecaId)
    if (!peca || semEsmalte <= 0) continue
    entradas.push({ pecaId, peca, corId: null, cor: null, prontas: semEsmalte })
  }

  return visaoDasProntas(entradas)
}
