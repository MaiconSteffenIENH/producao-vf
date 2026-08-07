/*
 * A BAIXA DO ESTOQUE DE PEÇAS PRONTAS.
 *
 * Até aqui o sistema só sabia SOMAR: os movimentos de lote registram produção,
 * e peça que chegava em PRONTO ficava lá para sempre. O rodapé da tela avisava
 * com todas as letras que aquilo era "quanto o ateliê finalizou", e não "quanto
 * tem na prateleira" — uma diferença que cresce todo mês até o número não
 * servir para nada.
 *
 * ── POR QUE A PESSOA NÃO ESCOLHE O LOTE ──
 *
 * Quem embala o pedido sabe que saiu um BOWL PISTACHE. Não sabe, e não tem como
 * saber, que ele veio do L-0031 — as peças estão todas na mesma prateleira.
 * Exigir o lote na hora da baixa é a forma mais garantida de a baixa nunca ser
 * feita. Então a pessoa diz peça, esmalte e quantidade, e a distribuição pelos
 * lotes é conta de máquina.
 *
 * ── POR QUE O LOTE MAIS ANTIGO PRIMEIRO ──
 *
 * Cerâmica não vence, mas a ordem importa por dois motivos. O primeiro é que é
 * assim que a prateleira funciona de verdade: a peça velha está na frente. O
 * segundo é que sem uma regra fixa, dois lotes iguais seriam escolhidos por
 * ordem de id — e o mesmo estoque, com a mesma baixa, produziria históricos
 * diferentes conforme o dia.
 *
 * ── SAÍDA NÃO É PERDA ──
 *
 * Peça vendida não pode entrar na taxa de perda. Se entrasse, `perdaDaPeca`
 * inflaria, o planejamento mandaria produzir a mais e `custoUnitarioReal`
 * cobraria de todo mundo a "quebra" de quem comprou. Por isso a saída é um tipo
 * de movimento próprio, e o único motivo que vira perda de verdade é a peça que
 * quebrou depois de pronta — porque essa quebrou mesmo.
 */

export type MotivoDeSaida = {
  valor: string
  rotulo: string
  /** o que este motivo faz com o saldo: tira ou devolve */
  sentido: 'saida' | 'entrada'
  /** peça que quebrou é perda de verdade, e conta na taxa de perda */
  ehPerda?: boolean
  /**
   * Qual saída este motivo DESFAZ.
   *
   * Só motivo de entrada tem. Era 'feira' cravado no serviço, e por isso
   * corrigir uma venda para menos procurava devolução entre as idas à feira,
   * não achava nada e devolvia zero dizendo que tinha devolvido.
   */
  reverteDe?: string
  ajuda: string
}

/*
 * Lista fixa, como a de motivos de perda, e pelo mesmo motivo: campo livre vira
 * "venda", "Venda", "vendido" e "vendi" no mesmo relatório, e o ranking que
 * justifica a lista se desfaz em silêncio.
 */
export const MOTIVOS_DE_SAIDA: readonly MotivoDeSaida[] = [
  {
    valor: 'venda',
    rotulo: 'Venda',
    sentido: 'saida',
    ajuda: 'Loja própria, Mercado Livre, Shopee — peça que saiu vendida.',
  },
  {
    valor: 'feira',
    rotulo: 'Foi para feira',
    sentido: 'saida',
    ajuda: 'Saiu da prateleira para vender presencialmente. O que não vender volta por "Voltou da feira".',
  },
  {
    valor: 'devolucao_feira',
    rotulo: 'Voltou da feira',
    sentido: 'entrada',
    reverteDe: 'feira',
    ajuda: 'Devolve ao estoque o que foi para a feira e não vendeu.',
  },
  {
    valor: 'estorno_venda',
    rotulo: 'Desfazer uma venda',
    sentido: 'entrada',
    reverteDe: 'venda',
    ajuda: 'Venda cancelada, devolução do cliente, ou correção de uma venda lançada a mais.',
  },
  {
    valor: 'brinde',
    rotulo: 'Brinde ou amostra',
    sentido: 'saida',
    ajuda: 'Presente, peça de foto, cortesia. Sai do estoque sem virar venda.',
  },
  {
    valor: 'uso_proprio',
    rotulo: 'Uso do ateliê',
    sentido: 'saida',
    ajuda: 'Ficou em casa, virou peça de exposição ou de uso da Vera.',
  },
  {
    valor: 'quebra_pronta',
    rotulo: 'Quebrou depois de pronta',
    sentido: 'saida',
    ehPerda: true,
    ajuda: 'Estourou na prateleira, na embalagem ou no transporte. Esta é a única que conta como perda.',
  },
] as const

const PORVALOR = new Map(MOTIVOS_DE_SAIDA.map((m) => [m.valor, m]))

export function motivoDeSaida(valor: unknown): MotivoDeSaida | null {
  return typeof valor === 'string' ? (PORVALOR.get(valor) ?? null) : null
}

export function rotuloDaSaida(valor: string | null | undefined): string {
  if (!valor) return 'Não informado'
  return PORVALOR.get(valor)?.rotulo ?? valor
}

export function mensagemDeMotivoDeSaidaInvalido(valor: string): string {
  return (
    `"${valor}" não é um motivo de saída conhecido. Use um destes: ` +
    MOTIVOS_DE_SAIDA.map((m) => m.rotulo).join(', ') + '.'
  )
}

// ─────────────────────────── A distribuição ───────────────────────────

export type LoteComSaldo = {
  loteId: string
  codigo: string
  /**
   * Em QUAL etapa final estas peças estão.
   *
   * Nada impede o ateliê de cadastrar duas etapas do tipo `final` — a tela de
   * Etapas oferece o tipo e o banco não exige unicidade. A primeira versão
   * disto olhava só a primeira etapa com saldo e parava: a tela mostrava 10
   * (que soma todas), o servidor via 6, e a baixa respondia "faltaram 4" sobre
   * peça que estava ali do lado.
   */
  etapaId: string
  /** quanto deste lote está parado NESTA etapa final */
  saldo: number
  /** para ordenar: o lote mais antigo sai primeiro */
  abertoEm: Date
}

export type FatiaDaBaixa = { loteId: string; codigo: string; etapaId: string; quantidade: number }

export type Distribuicao = {
  fatias: FatiaDaBaixa[]
  /** quanto foi possível baixar */
  baixado: number
  /** quanto o estoque não cobriu — zero quando deu tudo certo */
  faltou: number
}

/**
 * Reparte a baixa entre os lotes, do mais antigo para o mais novo.
 *
 * NÃO estoura quando falta estoque: devolve `faltou`. Quem chamou decide — a
 * tela de baixa recusa e explica, mas o registro de uma VENDA não pode ser
 * recusado por causa disso. Vender peça feita antes de o sistema existir é
 * normal, e travar o livro de faturamento por falta de saldo trocaria um número
 * impreciso por um número que não existe.
 */
export function distribuirBaixa(lotes: readonly LoteComSaldo[], quantidade: number): Distribuicao {
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return { fatias: [], baixado: 0, faltou: Math.max(0, quantidade) }
  }

  const ordenados = [...lotes]
    .filter((l) => l.saldo > 0)
    .sort((a, b) => {
      const idade = a.abertoEm.getTime() - b.abertoEm.getTime()
      if (idade !== 0) return idade
      // desempate estável: sem ele, dois lotes do mesmo dia sairiam em ordem de
      // id, e a mesma baixa produziria históricos diferentes conforme o dia
      return a.codigo.localeCompare(b.codigo, 'pt-BR')
    })

  const fatias: FatiaDaBaixa[] = []
  let restante = quantidade

  for (const lote of ordenados) {
    if (restante <= 0) break
    const leva = Math.min(lote.saldo, restante)
    if (leva > 0) {
      fatias.push({ loteId: lote.loteId, codigo: lote.codigo, etapaId: lote.etapaId, quantidade: leva })
      restante -= leva
    }
  }

  return { fatias, baixado: quantidade - restante, faltou: restante }
}

/**
 * A volta: devolver ao estoque o que saiu, do mais RECENTE para o mais antigo.
 *
 * Serve para a caixa que voltou da feira e para desfazer uma baixa errada. A
 * ordem é o espelho da saída de propósito: devolver ao lote mais recente que
 * perdeu peça desfaz a última coisa que aconteceu, que é quase sempre o que a
 * pessoa quer corrigir.
 *
 * O teto é o que de fato SAIU. Sem ele, "devolver" viraria uma porta para criar
 * peça do nada — e peça que nasce sem passar pela produção estraga a taxa de
 * perda, o custo por peça e a contagem de quanto o ateliê consegue fazer.
 */
export function distribuirDevolucao(
  saidasPorLote: readonly {
    loteId: string
    codigo: string
    etapaId: string
    saiu: number
    saidaEm: Date
  }[],
  quantidade: number,
): Distribuicao {
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return { fatias: [], baixado: 0, faltou: Math.max(0, quantidade) }
  }

  const ordenados = [...saidasPorLote]
    .filter((s) => s.saiu > 0)
    .sort((a, b) => {
      const quando = b.saidaEm.getTime() - a.saidaEm.getTime()
      if (quando !== 0) return quando
      return a.codigo.localeCompare(b.codigo, 'pt-BR')
    })

  const fatias: FatiaDaBaixa[] = []
  let restante = quantidade

  for (const s of ordenados) {
    if (restante <= 0) break
    const leva = Math.min(s.saiu, restante)
    if (leva > 0) {
      fatias.push({ loteId: s.loteId, codigo: s.codigo, etapaId: s.etapaId, quantidade: leva })
      restante -= leva
    }
  }

  return { fatias, baixado: quantidade - restante, faltou: restante }
}

/**
 * A frase que a tela mostra depois de uma baixa parcial.
 *
 * Existe aqui, e não na tela, porque é a única resposta possível para o caso
 * mais chato do sistema: a Vera vende 12 peças e o estoque só conhece 8, porque
 * as outras 4 foram feitas antes de tudo isto existir. Recusar a venda seria
 * pior; fingir que baixou 12 seria mentira. Então diz-se exatamente o que houve.
 */
export function frasePaciente(pedido: number, baixado: number, faltou: number): string | null {
  if (faltou <= 0) return null
  if (baixado <= 0) {
    return (
      `Não havia nenhuma peça deste esmalte no estoque de prontas, então nada foi baixado ` +
      `(faltaram ${faltou} de ${pedido}). Isso é esperado para peça feita antes de o sistema existir.`
    )
  }
  return (
    `Baixei ${baixado} de ${pedido}: o estoque de prontas só tinha isso. As outras ${faltou} ` +
    'provavelmente foram feitas antes de o sistema existir.'
  )
}
