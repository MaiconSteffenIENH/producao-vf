/**
 * O FORNO.
 *
 * Queima não é etapa por onde a peça passa sozinha: é evento em lote que junta
 * peças de vários lotes, ocupa volume fixo e trava o forno por ~2 dias entre
 * aquecer, queimar e esfriar. Modelar como etapa comum escondia três coisas —
 * quando fica pronto, se cabe, e o maior risco de perda do ateliê.
 *
 * E esconde a consequência que mais vale, que é o motivo deste arquivo existir:
 *
 *     Peça não espera o forno. Espera o forno ENCHER.
 *
 * Daí sai a sugestão que nenhum ateliê calcula de cabeça: "há 68 peças
 * esperando; faltam 12 para fechar a carga; produzir essas 12 adianta as 68".
 *
 * Puro de propósito — sem banco, para a conta ser testável.
 */

export type LoteEsperando = {
  loteId: string
  codigo: string
  pecaNome: string
  quantidade: number
  /** há quantos dias este lote está parado esperando a carga fechar */
  diasParado: number
}

export type SituacaoDaCarga = {
  capacidade: number
  esperando: number
  /** quanto cabe agora, se a fornada saísse neste instante */
  cabeAgora: number
  /** quantas peças faltam para fechar a carga; zero quando já dá */
  faltamParaFechar: number
  /** a carga está cheia (ou passou) e não há motivo para segurar */
  podeQueimar: boolean
  /** ocupação em % — o número que diz se vale gastar a queima agora */
  ocupacao: number
  /** o lote mais antigo da fila, para o caso de esperar tempo demais */
  esperaMaisLonga: number
}

/**
 * Como está a fila para a próxima fornada de um tipo (biscoito ou esmalte).
 */
export function situacaoDaCarga(lotes: LoteEsperando[], capacidade: number): SituacaoDaCarga {
  const esperando = lotes.reduce((n, l) => n + l.quantidade, 0)
  const cap = Math.max(1, capacidade)
  const cabeAgora = Math.min(esperando, cap)
  const faltamParaFechar = Math.max(0, cap - esperando)
  return {
    capacidade: cap,
    esperando,
    cabeAgora,
    faltamParaFechar,
    podeQueimar: esperando >= cap,
    ocupacao: Math.round((Math.min(esperando, cap) / cap) * 100),
    esperaMaisLonga: lotes.reduce((maior, l) => Math.max(maior, l.diasParado), 0),
  }
}

/**
 * A partir de quantos dias parado o sistema para de esperar a carga encher e
 * manda queimar assim mesmo. Segurar peça indefinidamente à espera do último
 * lugar do forno é o modo de falha oposto — e mais caro, porque a peça já
 * existe e está travada.
 */
export const DIAS_ATE_QUEIMAR_MEIA_CARGA = 7

/** Ocupação abaixo da qual não vale gastar a queima, se ninguém está esperando há muito. */
export const OCUPACAO_MINIMA_ACEITAVEL = 60

export type RecomendacaoDeQueima =
  | { acao: 'queimar'; motivo: string }
  | { acao: 'completar'; faltam: number; motivo: string }
  | { acao: 'esperar'; motivo: string }

/**
 * O que fazer com a fila de agora. Três respostas possíveis, e a do meio é a
 * que gera trabalho útil: *completar* diz exatamente quantas peças produzir
 * para desbloquear todas as outras.
 */
export function recomendarQueima(situacao: SituacaoDaCarga): RecomendacaoDeQueima {
  if (situacao.esperando === 0) {
    return { acao: 'esperar', motivo: 'Não há nada na fila desta queima.' }
  }
  if (situacao.podeQueimar) {
    return {
      acao: 'queimar',
      motivo: `Dá carga cheia: ${situacao.esperando} peças esperando para ${situacao.capacidade} de capacidade.`,
    }
  }
  if (situacao.esperaMaisLonga >= DIAS_ATE_QUEIMAR_MEIA_CARGA) {
    return {
      acao: 'queimar',
      motivo:
        `Tem peça parada há ${situacao.esperaMaisLonga} dias. A ${situacao.ocupacao}% de ocupação a queima sai mais cara ` +
        'por peça, mas segurar mais que uma semana custa mais do que isso.',
    }
  }
  if (situacao.ocupacao >= OCUPACAO_MINIMA_ACEITAVEL) {
    return {
      acao: 'completar',
      faltam: situacao.faltamParaFechar,
      motivo:
        `${situacao.esperando} peças esperando, ${situacao.ocupacao}% do forno. ` +
        `Faltam ${situacao.faltamParaFechar} para fechar a carga — e essas ${situacao.faltamParaFechar} adiantam as outras ${situacao.esperando}.`,
    }
  }
  return {
    acao: 'completar',
    faltam: situacao.faltamParaFechar,
    motivo:
      `Só ${situacao.esperando} peças na fila (${situacao.ocupacao}% do forno). ` +
      `Faltam ${situacao.faltamParaFechar} para valer a queima.`,
  }
}

/**
 * Quais lotes entram na fornada, respeitando a capacidade.
 *
 * Ordem: quem está esperando há mais tempo entra primeiro. É a regra justa e
 * é também a que evita o lote esquecido — sem ela, um lote pequeno pode ficar
 * eternamente fora porque sempre chega um maior.
 *
 * Lote pode entrar PARCIALMENTE: 40 peças numa vaga de 25 mandam 25 e deixam
 * 15 para a próxima. É o mesmo movimento parcial que o resto do sistema já faz.
 */
export function montarCarga(
  lotes: LoteEsperando[],
  capacidade: number,
): { loteId: string; quantidade: number }[] {
  const ordenados = [...lotes].sort((a, b) => {
    if (b.diasParado !== a.diasParado) return b.diasParado - a.diasParado
    return a.codigo.localeCompare(b.codigo, 'pt-BR')
  })
  let vagas = Math.max(0, capacidade)
  const carga: { loteId: string; quantidade: number }[] = []
  for (const lote of ordenados) {
    if (vagas <= 0) break
    const quantidade = Math.min(lote.quantidade, vagas)
    if (quantidade > 0) {
      carga.push({ loteId: lote.loteId, quantidade })
      vagas -= quantidade
    }
  }
  return carga
}
