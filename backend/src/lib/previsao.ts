/**
 * QUANDO FICA PRONTO.
 *
 * `Peca.tempoMedioDias` e `RoteiroEtapa.diasEstimados` existiam no banco desde
 * o começo, eram gravados, devolvidos — e nunca entravam em conta nenhuma. O
 * sistema tinha a informação e não respondia a pergunta que está atrás de toda
 * feira, todo Natal e toda encomenda.
 *
 * Duas honestidades embutidas aqui, e as duas mudam o formato da resposta:
 *
 * 1. SECAGEM depende de umidade. Em Novo Hamburgo o inverno seca bem mais
 *    devagar que o verão. Uma previsão que ignora isso erra sempre para menos.
 * 2. QUEIMA depende de fechar carga. O lote não espera a etapa, espera o forno
 *    encher — e isso pode ser hoje ou daqui a uma semana.
 *
 * Por isso a saída é FAIXA, não data cravada. Prometer "dia 12" e entregar dia
 * 19 é pior do que dizer "entre 3 e 5 semanas" e cumprir.
 */

export type EtapaDoRoteiro = {
  etapaId: string
  nome: string
  ordem: number
  diasEstimados: number
  /** etapa que só anda quando o forno enche */
  aguardaCarga: boolean
  /** etapa de estoque parado (biscoito): o lote fica até a demanda chamar */
  estoqueIntermediario: boolean
}

export type Previsao = {
  diasMinimo: number
  diasMaximo: number
  /** etapas que ainda faltam, na ordem */
  etapasRestantes: string[]
  /** quantas esperas de carga há no caminho — cada uma é uma incerteza */
  esperasDeCarga: number
  /** o roteiro passa por estoque neutro, então não há prazo enquanto ninguém pedir */
  bloqueadoEmEstoque: boolean
  explicacao: string
}

/** Folga aplicada sobre a soma dos dias, para virar o teto da faixa. */
export const FOLGA_MAXIMO = 0.35

/** Dias de espera típica até uma carga de forno fechar. */
export const ESPERA_TIPICA_DE_CARGA = 4

/**
 * Quanto falta para o lote ficar pronto, a partir da etapa em que ele está.
 *
 * `etapaAtualOrdem` é a ordem da etapa onde o saldo do lote está hoje; passe
 * `0` para calcular o roteiro inteiro (é o caso do planejamento, que estima
 * peça que ainda nem começou).
 */
export function preverConclusao(
  roteiro: EtapaDoRoteiro[],
  etapaAtualOrdem: number,
  esperaDeCargaDias = ESPERA_TIPICA_DE_CARGA,
): Previsao {
  const restantes = roteiro
    .filter((e) => e.ordem > etapaAtualOrdem)
    .sort((a, b) => a.ordem - b.ordem)

  if (restantes.length === 0) {
    return {
      diasMinimo: 0,
      diasMaximo: 0,
      etapasRestantes: [],
      esperasDeCarga: 0,
      bloqueadoEmEstoque: false,
      explicacao: 'O lote já passou por todas as etapas do roteiro.',
    }
  }

  const dias = restantes.reduce((n, e) => n + Math.max(0, e.diasEstimados), 0)
  const esperasDeCarga = restantes.filter((e) => e.aguardaCarga).length
  const bloqueadoEmEstoque = restantes.some((e) => e.estoqueIntermediario)

  // cada espera de carga entra no mínimo com a espera típica e no máximo com o
  // dobro dela: é a incerteza honesta de "depende de quantas peças chegarem"
  const diasMinimo = dias + esperasDeCarga * esperaDeCargaDias
  const diasMaximo = Math.ceil((dias + esperasDeCarga * esperaDeCargaDias * 2) * (1 + FOLGA_MAXIMO))

  const partes = [`${restantes.length} etapa${restantes.length === 1 ? '' : 's'} pela frente`]
  if (esperasDeCarga > 0) {
    partes.push(
      `${esperasDeCarga} espera${esperasDeCarga === 1 ? '' : 's'} de forno encher (a maior incerteza da conta)`,
    )
  }
  if (bloqueadoEmEstoque) {
    partes.push('passa por biscoito, que só anda quando alguém escolher a cor')
  }

  return {
    diasMinimo,
    diasMaximo,
    etapasRestantes: restantes.map((e) => e.nome),
    esperasDeCarga,
    bloqueadoEmEstoque,
    explicacao: partes.join('; ') + '.',
  }
}

/** Data somando dias corridos — o ateliê não para no fim de semana de propósito. */
export function somarDias(base: Date, dias: number): Date {
  const d = new Date(base.getTime())
  d.setUTCDate(d.getUTCDate() + dias)
  return d
}

/** "entre 21 e 33 dias" / "cerca de 4 dias" — como aparece na tela. */
export function faixaEmTexto(previsao: Previsao): string {
  if (previsao.diasMaximo === 0) return 'pronto'
  if (previsao.diasMinimo === previsao.diasMaximo) return `cerca de ${previsao.diasMinimo} dias`
  return `entre ${previsao.diasMinimo} e ${previsao.diasMaximo} dias`
}

/**
 * Dá para entregar até a data pedida?
 *
 * Compara com o TETO da faixa, não com o piso. Prometer pelo melhor caso é
 * como o ateliê perde cliente de encomenda.
 */
export function cabeNoPrazo(previsao: Previsao, hoje: Date, entregarAte: Date): boolean {
  return somarDias(hoje, previsao.diasMaximo).getTime() <= entregarAte.getTime()
}

/** Semanas para repor, arredondado para cima — entra na conta de cobertura. */
export function semanasParaRepor(previsao: Previsao): number {
  return Math.max(1, Math.ceil(previsao.diasMaximo / 7))
}
