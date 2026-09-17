/*
 * MOTIVOS DE SAÍDA — gêmeo de backend/src/lib/saida-estoque.ts.
 *
 * Mesma combinação de sempre: o backend recusa valor fora desta lista, a tela
 * precisa oferecer as opções e traduzir o que já foi gravado. Cópia e não
 * import porque front e back são pacotes separados, e um endpoint só para
 * buscar seis palavras fixas custaria uma ida à rede no 4G do ateliê toda vez
 * que alguém abrisse o modal de baixa.
 *
 * MUDOU UM `valor` AQUI, MUDE LÁ. O valor é o que fica gravado no banco:
 * trocar a string renomeia o motivo de toda saída antiga para "desconhecido".
 * Um teste de unidade compara os dois arquivos e falha se eles divergirem.
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
  /**
   * Só o sistema usa: a tela de baixa não oferece.
   *
   * Desfazer uma venda pela prateleira deixaria a linha de Vendas inflada, e a
   * cobertura continuaria contando peça que voltou. A correção nasce em Vendas,
   * e é de lá que o estorno chega ao livro-razão.
   */
  viaVendas?: boolean
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
    ajuda: 'Shopee ou Mercado Livre. Pede o canal e já entra em Vendas, no mês de hoje.',
  },
  {
    valor: 'estorno_venda',
    rotulo: 'Desfazer uma venda',
    sentido: 'entrada',
    reverteDe: 'venda',
    viaVendas: true,
    ajuda: 'Venda cancelada, devolução do cliente, ou correção de uma venda lançada a mais. Corrija em Vendas.',
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

/** o que a tela de baixa oferece: o estorno de venda entra por Vendas */
export const MOTIVOS_DA_TELA_DE_BAIXA: readonly MotivoDeSaida[] = MOTIVOS_DE_SAIDA.filter((m) => !m.viaVendas)

/*
 * Feira e lojista saíram em 17/09/2026: o ateliê vende só por marketplace
 * (Shopee e Mercado Livre). O que já foi gravado com esses motivos continua
 * legível no histórico; só não se grava mais.
 */
const ROTULOS_ANTIGOS: Record<string, string> = {
  feira: 'Foi para feira',
  devolucao_feira: 'Voltou da feira',
}

const PORVALOR = new Map(MOTIVOS_DE_SAIDA.map((m) => [m.valor, m]))

export function rotuloDaSaida(valor: string | null | undefined): string {
  if (!valor) return 'Não informado'
  return PORVALOR.get(valor)?.rotulo ?? ROTULOS_ANTIGOS[valor] ?? valor
}

export const ajudaDaSaida = (valor: string): string => PORVALOR.get(valor)?.ajuda ?? ''
