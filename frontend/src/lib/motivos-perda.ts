/*
 * MOTIVOS DE PERDA — gêmeo de backend/src/lib/motivos-perda.ts.
 *
 * Os dois lados precisam da MESMA lista: o backend recusa valor fora dela, a
 * tela precisa oferecer as opções e traduzir o que já foi gravado. Aqui só mora
 * a lista e o rótulo — a conta do ranking fica de um lado só, no backend, porque
 * duas contas de porcentagem discordam no primeiro arredondamento.
 *
 * Cópia e não import: front e back são pacotes separados, sem workspace comum, e
 * um endpoint só para buscar seis palavras fixas custaria uma ida à rede em cada
 * abertura do modal — no 4G do ateliê, justamente no momento em que a pessoa
 * está com a peça quebrada na mão. É o mesmo arranjo de `plural`, que vive em
 * `lib/plural.ts` no backend e em `lib/format.ts` aqui.
 *
 * MUDOU UM VALOR AQUI, MUDE LÁ. O `valor` é o que está gravado no banco: trocar
 * a string renomeia o motivo de todo movimento antigo para "desconhecido".
 */

export type MotivoDePerda = {
  valor: string
  rotulo: string
  /** o que separa este motivo do vizinho — vira a dica do campo na hora de escolher */
  ajuda: string
}

export const MOTIVOS_PERDA: MotivoDePerda[] = [
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

/** Perda gravada antes desta lista existir — nunca terá motivo, e isso é normal. */
export const MOTIVO_NAO_INFORMADO = 'nao_informado'

/** Filtro "só o que teve perda", de qualquer motivo. */
export const MOTIVO_QUALQUER = 'qualquer'

const POR_VALOR = new Map(MOTIVOS_PERDA.map((m) => [m.valor, m]))

/** Rótulo do que está gravado. Valor estranho volta como veio, para não sumir. */
export function rotuloDoMotivo(valor: string | null | undefined): string {
  const limpo = (valor ?? '').trim()
  if (!limpo || limpo === MOTIVO_NAO_INFORMADO) return 'Não informado'
  return POR_VALOR.get(limpo)?.rotulo ?? limpo
}

/** A explicação do motivo escolhido, para o campo dizer o que cabe ali. */
export const ajudaDoMotivo = (valor: string): string | undefined => POR_VALOR.get(valor)?.ajuda
