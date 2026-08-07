import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { conflito, invalido, regraDeNegocio } from '../lib/erros'
import type { Sessao } from '../lib/token'
import { atualizarConclusaoDoLote, saldosPorLote } from './lote.service'
import {
  visaoDasProntas,
  visaoDoBiscoito,
  type EntradaDeBiscoito,
  type EntradaDeProntas,
} from '../lib/estoque'
import {
  distribuirBaixa,
  distribuirDevolucao,
  frasePaciente,
  mensagemDeMotivoDeSaidaInvalido,
  motivoDeSaida,
  rotuloDaSaida,
  type LoteComSaldo,
} from '../lib/saida-estoque'

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
      select: {
      tipo: true,
      quantidade: true,
      motivoTipo: true,
      etapaDestinoId: true,
      lote: { select: { pecaId: true } },
    },
    }),
    prisma.etapa.findMany({ where: { tipo: 'final' }, select: { id: true } }),
  ])
  const finais = new Set(etapasFinais.map((e: { id: string }) => e.id))

  const perdas = new Map<string, number>()
  const concluidas = new Map<string, number>()

  for (const m of movimentos as {
    tipo: string
    quantidade: number
    motivoTipo: string | null
    etapaDestinoId: string | null
    lote: { pecaId: string }
  }[]) {
    const peca = m.lote.pecaId
    if (m.tipo === 'perda') {
      perdas.set(peca, (perdas.get(peca) ?? 0) + m.quantidade)
      /*
       * A PEÇA QUE QUEBROU DEPOIS DE PRONTA JÁ FOI CONTADA UMA VEZ.
       *
       * Ela entrou em `concluidas` quando chegou na etapa final. Sem tirá-la de
       * lá, a mesma peça apareceria nos dois lados da fração e a amostra viria
       * inflada — encarecendo `custoUnitarioReal` para todo mundo por causa de
       * uma peça só.
       */
      if (m.motivoTipo === 'quebra_pronta') {
        concluidas.set(peca, (concluidas.get(peca) ?? 0) - m.quantidade)
      }
    }
    /*
     * DEVOLUÇÃO NÃO É PEÇA NOVA.
     *
     * A caixa que voltou da feira entra na etapa final de novo, e sem esta
     * exceção ela contaria como uma segunda conclusão da mesma peça: a amostra
     * inflaria, a taxa de perda cairia sozinha e o custo por peça viria baixo —
     * bastando levar as mesmas peças para a feira algumas vezes.
     */
    else if (m.tipo !== 'devolucao' && m.etapaDestinoId && finais.has(m.etapaDestinoId)) {
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

// ═══════════════════ Baixa do estoque de peças prontas ═══════════════════

/*
 * O QUE FALTAVA PARA O NÚMERO DA TELA SER ESTOQUE DE VERDADE.
 *
 * Os movimentos de lote só sabiam somar: peça que chegava em PRONTO ficava lá
 * para sempre, e a tela avisava no rodapé que aquilo era "quanto o ateliê
 * finalizou". Aqui entra a saída.
 *
 * A pessoa diz PEÇA, ESMALTE e QUANTIDADE. Quem embala o pedido não sabe de
 * qual lote veio a peça — elas estão todas na mesma prateleira — e exigir isso
 * seria garantir que a baixa nunca fosse feita. A repartição entre os lotes é
 * conta de máquina, do mais antigo para o mais novo.
 */

export type PedidoDeBaixa = {
  pecaId: string
  /** nulo = peça pronta que nunca teve esmalte definido */
  corId?: string | null
  quantidade: number
  /** um dos valores de lib/saida-estoque.ts */
  motivoTipo: string
  observacao?: string | null
  /** para o reenvio da fila offline não gravar duas vezes */
  chaveIdempotencia?: string | null
}

export type ResultadoDaBaixa = {
  pedido: number
  baixado: number
  faltou: number
  /** de quais lotes saiu — a tela mostra para a pessoa reconhecer o que mexeu */
  fatias: { codigo: string; quantidade: number }[]
  aviso: string | null
}

/** As etapas terminais: é nelas que a peça pronta fica parada. */
async function etapasFinais(): Promise<string[]> {
  const etapas = (await prisma.etapa.findMany({
    where: { tipo: 'final' },
    // ordem fixa: `finais[0]` decide para onde a devolução volta, e sem
    // `orderBy` ele muda de uma consulta para outra
    orderBy: [{ ordemPadrao: 'asc' }, { id: 'asc' }],
    select: { id: true },
  })) as { id: string }[]
  return etapas.map((e) => e.id)
}

/**
 * As pilhas daquela peça+esmalte paradas no fim da linha.
 *
 * Uma entrada por LOTE e por ETAPA final. Nada impede o ateliê de cadastrar
 * duas etapas do tipo `final`, e a primeira versão disto pegava só a primeira
 * com saldo e parava — a tela somava as duas e o servidor via uma.
 *
 * `corId: null` quer dizer "prontas sem esmalte definido", que é caso real: o
 * roteiro pode não ter etapa de cor. Não é o mesmo que "qualquer cor" — juntar
 * os dois faria a baixa de um esmalte comer o estoque de outro.
 */
async function prontasPorLote(pecaId: string, corId: string | null, finais: string[]) {
  const lotes = (await prisma.lote.findMany({
    where: { pecaId, corId, canceladoEm: null },
    select: { id: true, codigo: true, iniciadoEm: true },
  })) as { id: string; codigo: string; iniciadoEm: Date }[]
  if (lotes.length === 0) return [] as LoteComSaldo[]

  const saldos = await saldosPorLote(lotes.map((l) => l.id))
  const pilhas: LoteComSaldo[] = []

  for (const lote of lotes) {
    const mapa = saldos.get(lote.id)
    if (!mapa) continue
    for (const etapaId of finais) {
      const saldo = mapa.get(etapaId) ?? 0
      if (saldo <= 0) continue
      pilhas.push({
        loteId: lote.id,
        codigo: lote.codigo,
        etapaId,
        saldo,
        abertoEm: lote.iniciadoEm,
      })
    }
  }
  return pilhas
}

/**
 * Quanto ainda está fora por um motivo de saída, lote a lote.
 *
 * A conta é saída MENOS devolução. A primeira versão procurava um sufixo
 * `_devolvido` que nada gravava, então o abatimento era ramo morto: dava para
 * apertar "Voltou da feira" indefinidamente e criar peça do nada, justamente o
 * que o teto existe para impedir.
 */
async function aindaForaPorLote(
  pecaId: string,
  corId: string | null,
  motivoDaSaida: string,
  motivoDaVolta: string,
) {
  const movimentos = (await prisma.movimentoLote.findMany({
    where: {
      lote: { pecaId, corId, canceladoEm: null },
      motivoTipo: { in: [motivoDaSaida, motivoDaVolta] },
    },
    orderBy: { criadoEm: 'asc' },
    select: {
      loteId: true,
      quantidade: true,
      criadoEm: true,
      motivoTipo: true,
      etapaOrigemId: true,
      etapaDestinoId: true,
      lote: { select: { codigo: true } },
    },
  })) as {
    loteId: string
    quantidade: number
    criadoEm: Date
    motivoTipo: string | null
    etapaOrigemId: string | null
    etapaDestinoId: string | null
    lote: { codigo: string }
  }[]

  type Fora = { loteId: string; codigo: string; etapaId: string; saiu: number; saidaEm: Date }
  const porChave = new Map<string, Fora>()

  for (const m of movimentos) {
    // saída tem origem; devolução tem destino. A etapa é a mesma nos dois.
    const etapaId = m.etapaOrigemId ?? m.etapaDestinoId
    if (!etapaId) continue
    const chave = `${m.loteId}:${etapaId}`
    const atual = porChave.get(chave) ?? {
      loteId: m.loteId,
      codigo: m.lote.codigo,
      etapaId,
      saiu: 0,
      saidaEm: m.criadoEm,
    }
    if (m.motivoTipo === motivoDaVolta) atual.saiu -= m.quantidade
    else {
      atual.saiu += m.quantidade
      atual.saidaEm = m.criadoEm
    }
    porChave.set(chave, atual)
  }
  return [...porChave.values()].filter((f) => f.saiu > 0)
}

/*
 * A CHAVE DE IDEMPOTÊNCIA, e por que ela virou `#1`, `#2`.
 *
 * A primeira versão procurava por prefixo (`startsWith`). O índice único da
 * coluna é `text_ops`, então `LIKE 'x%'` não o usa: era uma varredura no
 * livro-razão inteiro — a tabela que mais cresce — uma vez por linha da
 * planilha importada. Agora a primeira fatia leva a chave EXATA, que é o que a
 * conferência procura com `findUnique`.
 */
const chaveDaFatia = (base: string, indice: number) => (indice === 0 ? base : `${base}#${indice + 1}`)

export async function darBaixaDeProntas(
  pedido: PedidoDeBaixa,
  sessao: Sessao,
  agora = new Date(),
): Promise<ResultadoDaBaixa> {
  const motivo = motivoDeSaida(pedido.motivoTipo)
  if (!motivo) throw invalido(mensagemDeMotivoDeSaidaInvalido(String(pedido.motivoTipo)))
  if (!Number.isInteger(pedido.quantidade) || pedido.quantidade < 1) {
    throw invalido('A quantidade precisa ser um número inteiro, de 1 para cima.')
  }

  /*
   * REENVIO: responde com o que FOI gravado, e não com o que foi pedido.
   *
   * A primeira versão devolvia `baixado: quantidade, faltou: 0` sem olhar nada.
   * Se a primeira tentativa tinha baixado 3 de 12, o reenvio dizia 12 — e a
   * importação somava esse número no total que a tela mostra. Era um número
   * fabricado.
   */
  if (pedido.chaveIdempotencia) {
    const jaFeito = await prisma.movimentoLote.findUnique({
      where: { chaveIdempotencia: pedido.chaveIdempotencia },
    })
    if (jaFeito) {
      const todas = (await prisma.movimentoLote.findMany({
        where: { chaveIdempotencia: { startsWith: pedido.chaveIdempotencia } },
        select: { quantidade: true, lote: { select: { codigo: true } } },
      })) as { quantidade: number; lote: { codigo: string } }[]
      const baixado = todas.reduce((n, m) => n + m.quantidade, 0)
      return {
        pedido: pedido.quantidade,
        baixado,
        faltou: Math.max(0, pedido.quantidade - baixado),
        fatias: todas.map((m) => ({ codigo: m.lote.codigo, quantidade: m.quantidade })),
        aviso: null,
      }
    }
  }

  // `|| null` e não `?? null`: o <Select> vazio manda '', e string vazia numa
  // coluna uuid derruba a consulta com erro de sintaxe do Postgres
  const corId = pedido.corId || null
  const finais = await etapasFinais()
  if (finais.length === 0) {
    throw regraDeNegocio(
      'Nenhuma etapa está marcada como final, então o sistema não sabe onde a peça pronta fica parada. ' +
        'Ajuste em Etapas.',
    )
  }

  const eDevolucao = motivo.sentido === 'entrada'
  const distribuicao = eDevolucao
    ? distribuirDevolucao(
        await aindaForaPorLote(pedido.pecaId, corId, motivo.reverteDe ?? 'venda', motivo.valor),
        pedido.quantidade,
      )
    : distribuirBaixa(await prontasPorLote(pedido.pecaId, corId, finais), pedido.quantidade)

  if (distribuicao.fatias.length > 0) {
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        for (const [i, fatia] of distribuicao.fatias.entries()) {
          await tx.movimentoLote.create({
            data: {
              loteId: fatia.loteId,
              etapaOrigemId: eDevolucao ? null : fatia.etapaId,
              etapaDestinoId: eDevolucao ? fatia.etapaId : null,
              quantidade: fatia.quantidade,
              /*
               * SAÍDA NÃO É PERDA. `perdaDaPeca` e `custoUnitarioReal` só olham
               * `tipo: 'perda'` — se a venda entrasse ali, o planejamento
               * mandaria produzir a mais e o custo cobraria de todo mundo a
               * "quebra" de quem comprou.
               */
              tipo: motivo.ehPerda ? 'perda' : eDevolucao ? 'devolucao' : 'saida',
              motivoTipo: motivo.valor,
              corId,
              motivo: pedido.observacao?.trim() || motivo.rotulo,
              usuarioId: sessao.id,
              usuarioNome: sessao.nome,
              criadoEm: agora,
              chaveIdempotencia: pedido.chaveIdempotencia
                ? chaveDaFatia(pedido.chaveIdempotencia, i)
                : null,
            },
          })
        }
      })
    } catch (erro) {
      // duas pessoas dando a mesma baixa ao mesmo tempo: o índice único derruba
      // a segunda, e o banco garantiu que ela não gravou nada
      if ((erro as { code?: string }).code === 'P2002') {
        throw conflito('Esta baixa já foi registrada. Recarregue a tela para ver como ficou.')
      }
      throw erro
    }
    for (const fatia of distribuicao.fatias) await atualizarConclusaoDoLote(fatia.loteId)
  }

  return {
    pedido: pedido.quantidade,
    baixado: distribuicao.baixado,
    faltou: distribuicao.faltou,
    fatias: distribuicao.fatias.map((f) => ({ codigo: f.codigo, quantidade: f.quantidade })),
    aviso: eDevolucao
      ? distribuicao.faltou > 0
        ? `Só ${distribuicao.baixado} peça(s) desta combinação estavam fora por "${rotuloDaSaida(motivo.reverteDe)}", então foi só isso que voltou.`
        : null
      : frasePaciente(pedido.quantidade, distribuicao.baixado, distribuicao.faltou),
  }
}
