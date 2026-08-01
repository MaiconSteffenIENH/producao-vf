/*
 * MOTIVO DA PERDA — o que transforma o número em diagnóstico.
 *
 * A perda medida não é enfeite de relatório: ela infla o quanto o planejamento
 * manda produzir (`quantidadeComPerda`) e entra no custo real por peça na
 * precificação. Só que o motivo era texto livre, então o sistema sabia QUANTO
 * se perde e nunca POR QUÊ. "12% de perda no Bule" não muda nada na segunda de
 * manhã; "38% das perdas do Bule são trinca na secagem" muda a estufa de lugar.
 *
 * Texto livre não soma nem filtra. A mesma trinca vira "trincou", "trincada",
 * "rachou secando" e "abriu antes do forno" — quatro linhas para um defeito só,
 * e nenhuma conta possível. Por isso o motivo passa a vir de LISTA FIXA, com o
 * relato escrito continuando obrigatório ao lado dele: a lista agrupa para
 * somar, o texto guarda o caso para quem for ler daqui a três meses.
 *
 * A lista é curta de propósito. Ela é preenchida em pé, no celular, com barro
 * na mão, no minuto seguinte à peça quebrar — lista longa vira "outro" sempre,
 * e "outro" sempre é o mesmo texto livre com outro nome.
 *
 * Sem Prisma: é conta, e conta se testa sem banco.
 */

export type MotivoDePerda = {
  /** o que vai gravado na coluna — nunca muda, senão o histórico perde sentido */
  valor: string
  rotulo: string
  /** o que separa este motivo do vizinho, para duas pessoas classificarem igual */
  ajuda: string
}

/**
 * A lista combinada com a Vera, no vocabulário do ateliê.
 *
 * A ordem é a do caminho da peça (secagem → forno → esmalte → bancada), e não
 * alfabética: quem registra acabou de viver a etapa, e acha mais rápido o
 * motivo que está perto de onde estava.
 */
export const MOTIVOS_PERDA: readonly MotivoDePerda[] = [
  {
    valor: 'trinca_secagem',
    rotulo: 'Trincou na secagem',
    ajuda: 'Abriu antes de queimar — secagem rápida demais, corrente de ar ou parede desigual.',
  },
  {
    valor: 'quebra_forno',
    rotulo: 'Quebrou no forno',
    ajuda: 'Saiu quebrada ou estalada da fornada, incluindo peça que estourou.',
  },
  {
    valor: 'empeno',
    rotulo: 'Empenou',
    ajuda: 'Entortou, sentou ou perdeu o prumo. Inteira, mas não vende assim.',
  },
  {
    valor: 'falha_esmalte',
    rotulo: 'Falha de esmalte',
    ajuda: 'Esmalte encolheu, borbulhou, furou, escorreu ou saiu na cor errada.',
  },
  {
    valor: 'quebra_manuseio',
    rotulo: 'Quebrou no manuseio',
    ajuda: 'Caiu ou bateu fora do forno: bancada, prateleira, embalagem, transporte.',
  },
  {
    valor: 'outro',
    rotulo: 'Outro',
    ajuda: 'Nada acima serve. O texto abaixo é o que vai explicar isso depois.',
  },
]

/**
 * Perda gravada antes desta lista existir. NÃO é erro de preenchimento: são
 * meses de histórico legítimo que nunca terão motivo, e some do ranking seria
 * mentir o total de peças perdidas.
 */
export const MOTIVO_NAO_INFORMADO = 'nao_informado'

/** Filtro "só o que teve perda", de qualquer motivo — inclusive os sem motivo. */
export const MOTIVO_QUALQUER = 'qualquer'

const ROTULO_NAO_INFORMADO = 'Não informado'

const POR_VALOR = new Map(MOTIVOS_PERDA.map((m) => [m.valor, m]))

export function ehMotivoDePerda(valor: unknown): valor is string {
  return typeof valor === 'string' && POR_VALOR.has(valor)
}

/** Valor aceito pelo filtro do histórico: um motivo, "sem motivo" ou "qualquer". */
export function ehFiltroDeMotivo(valor: unknown): valor is string {
  return valor === MOTIVO_QUALQUER || valor === MOTIVO_NAO_INFORMADO || ehMotivoDePerda(valor)
}

/**
 * Rótulo para a tela. Valor desconhecido volta como veio, em vez de virar
 * "Não informado": motivo antigo (nulo) e motivo que a lista não reconhece são
 * problemas diferentes, e juntá-los esconderia o segundo para sempre.
 */
export function rotuloDoMotivo(valor: string | null | undefined): string {
  const limpo = (valor ?? '').trim()
  if (!limpo || limpo === MOTIVO_NAO_INFORMADO) return ROTULO_NAO_INFORMADO
  return POR_VALOR.get(limpo)?.rotulo ?? limpo
}

/** A recusa em pt-BR, com a lista junto — quem chamou errado precisa saber o que vale. */
export function mensagemDeMotivoInvalido(valor: string): string {
  return (
    `Motivo de perda desconhecido: "${valor}". ` +
    `Escolha um da lista: ${MOTIVOS_PERDA.map((m) => m.rotulo).join(', ')}.`
  )
}

export type MovimentoDePerda = {
  /** nulo em toda perda registrada antes da lista existir */
  motivoTipo?: string | null
  quantidade: number
}

export type LinhaDoRanking = {
  valor: string
  rotulo: string
  quantidade: number
  /** fatia do total de peças perdidas da amostra, com uma casa decimal */
  percentual: number
}

export type ResumoDeMotivos = {
  /** peças perdidas na amostra — é o mesmo número que a tela chama de "Perdas" */
  total: number
  /** quantas dessas já têm motivo; o resto é histórico anterior à lista */
  comMotivo: number
  ranking: LinhaDoRanking[]
  /** o campeão, ignorando o "não informado" — é ele que vira frase acionável */
  principal: LinhaDoRanking | null
}

function chaveDoMotivo(valor: string | null | undefined): string {
  const limpo = (valor ?? '').trim()
  return limpo || MOTIVO_NAO_INFORMADO
}

const posicaoNaLista = (valor: string): number => {
  const i = MOTIVOS_PERDA.findIndex((m) => m.valor === valor)
  return i === -1 ? MOTIVOS_PERDA.length : i
}

/**
 * Ranking dos motivos de uma lista de perdas.
 *
 * Uma casa decimal no percentual, e não inteiro: com 300 peças perdidas no ano,
 * arredondar para inteiro mostra "0%" num motivo que existe — e motivo que
 * aparece zerado é o mesmo que motivo escondido.
 *
 * O "não informado" fica SEMPRE por último, mesmo sendo o maior. No dia em que
 * este recurso entrar no ar ele será quase 100% do histórico, e ordenar por
 * quantidade empurraria para baixo justamente o diagnóstico que é a razão de o
 * ranking existir. Ele continua na lista, e continua contando no total, porque
 * omiti-lo faria as fatias somarem mais do que a perda real.
 */
export function rankingDeMotivos(movimentos: MovimentoDePerda[]): LinhaDoRanking[] {
  const porMotivo = new Map<string, number>()
  let total = 0

  for (const movimento of movimentos) {
    const quantidade = movimento.quantidade
    // quantidade não-positiva não é perda: geraria uma linha "0 peças, 0%"
    if (!Number.isFinite(quantidade) || quantidade <= 0) continue
    const chave = chaveDoMotivo(movimento.motivoTipo)
    porMotivo.set(chave, (porMotivo.get(chave) ?? 0) + quantidade)
    total += quantidade
  }

  if (total === 0) return []

  return [...porMotivo.entries()]
    .map(([valor, quantidade]) => ({
      valor,
      rotulo: rotuloDoMotivo(valor),
      quantidade,
      percentual: Math.round((quantidade / total) * 1000) / 10,
    }))
    .sort((a, b) => {
      const semA = a.valor === MOTIVO_NAO_INFORMADO
      const semB = b.valor === MOTIVO_NAO_INFORMADO
      if (semA !== semB) return semA ? 1 : -1
      if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade
      // empate desempata pela ordem do caminho da peça, para o ranking não
      // trocar de lugar sozinho entre um carregamento e outro
      return posicaoNaLista(a.valor) - posicaoNaLista(b.valor)
    })
}

/** O ranking mais o que a tela mostra sem abrir o detalhe: total e campeão. */
export function resumoDeMotivos(movimentos: MovimentoDePerda[]): ResumoDeMotivos {
  const ranking = rankingDeMotivos(movimentos)
  const total = ranking.reduce((soma, linha) => soma + linha.quantidade, 0)
  const semMotivo = ranking.find((linha) => linha.valor === MOTIVO_NAO_INFORMADO)?.quantidade ?? 0
  return {
    total,
    comMotivo: total - semMotivo,
    ranking,
    principal: ranking.find((linha) => linha.valor !== MOTIVO_NAO_INFORMADO) ?? null,
  }
}
