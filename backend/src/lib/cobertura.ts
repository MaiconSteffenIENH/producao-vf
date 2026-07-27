/**
 * VENDA versus PRODUÇÃO — o lado que faltava.
 *
 * O briefing pedia "comparar produção com vendas" e isso não existia. Sem
 * venda, `qtdMinimaDesejada` é um chute que a Vera dá uma vez e nunca revisa, e
 * todo o planejamento pende dele: o sistema respondia "estou fazendo o que eu
 * disse?" mas não "estou fazendo as coisas certas?".
 *
 * O número que resolve é a COBERTURA: quantas semanas o estoque pronto aguenta
 * no ritmo em que a peça sai. Comparada com o tempo de repor, ela deixa de ser
 * informação e vira alarme.
 *
 * Puro de propósito — sem banco.
 */

export type VendaMensal = {
  /** AAAA-MM */
  competencia: string
  quantidade: number
}

/**
 * Vendas por semana, a partir do histórico mensal.
 *
 * Só olha os últimos `meses` meses FECHADOS, e ignora o mês corrente de
 * propósito: no dia 3, o mês tem 3 dias de venda e 27 de nada — incluí-lo
 * derruba a média e faz o sistema achar que a peça parou de vender.
 *
 * 30,44 dias é a média real do mês (365,25 ÷ 12); usar 30 acumula erro ao
 * longo do ano.
 */
export function velocidadeSemanal(
  vendas: VendaMensal[],
  competenciaAtual: string,
  meses = 3,
): { porSemana: number; mesesConsiderados: number; total: number } {
  const fechadas = vendas
    .filter((v) => v.competencia < competenciaAtual)
    .sort((a, b) => b.competencia.localeCompare(a.competencia))
    .slice(0, meses)

  if (fechadas.length === 0) return { porSemana: 0, mesesConsiderados: 0, total: 0 }

  const total = fechadas.reduce((n, v) => n + v.quantidade, 0)
  const diasPorMes = 30.44
  const porDia = total / (fechadas.length * diasPorMes)
  return {
    porSemana: porDia * 7,
    mesesConsiderados: fechadas.length,
    total,
  }
}

export type Cobertura = {
  /** semanas que o estoque pronto aguenta; null quando não há venda para medir */
  semanas: number | null
  porSemana: number
  mesesConsiderados: number
  prontas: number
  /** o estoque acaba antes da reposição chegar */
  vaiFaltar: boolean
  /** frase pronta, do jeito que aparece na tela */
  explicacao: string
}

/**
 * Cobertura de uma peça (ou peça+cor).
 *
 * `semanasParaRepor` vem do roteiro: é o tempo entre começar e ficar pronto.
 * Se a cobertura é menor que ele, o estoque acaba antes de a reposição chegar —
 * e é exatamente aí que a peça some da loja.
 */
export function calcularCobertura(
  prontas: number,
  vendas: VendaMensal[],
  competenciaAtual: string,
  semanasParaRepor: number,
  aCaminho = 0,
): Cobertura {
  const { porSemana, mesesConsiderados, total } = velocidadeSemanal(vendas, competenciaAtual)

  if (porSemana <= 0) {
    return {
      semanas: null,
      porSemana: 0,
      mesesConsiderados,
      prontas,
      vaiFaltar: false,
      explicacao:
        mesesConsiderados === 0
          ? 'Sem venda registrada ainda — a cobertura aparece quando houver ao menos um mês fechado.'
          : `Nenhuma venda nos últimos ${mesesConsiderados} meses fechados.`,
    }
  }

  const semanas = prontas / porSemana
  // o que está a caminho conta como reposição já contratada: se ela chega antes
  // do estoque acabar, não há ruptura
  const semanasComACaminho = (prontas + aCaminho) / porSemana
  const vaiFaltar = semanas < semanasParaRepor && semanasComACaminho < semanasParaRepor

  const arred = (n: number) => n.toFixed(1).replace('.', ',')
  return {
    semanas,
    porSemana,
    mesesConsiderados,
    prontas,
    vaiFaltar,
    explicacao:
      `Sai ${arred(porSemana)} por semana (média de ${mesesConsiderados} ${mesesConsiderados === 1 ? 'mês' : 'meses'}). ` +
      `${prontas} pronta${prontas === 1 ? '' : 's'} cobrem ${arred(semanas)} semanas, e repor leva ${semanasParaRepor}.` +
      (vaiFaltar ? ' Vai faltar.' : ''),
  }
}

/**
 * O mínimo que a peça DEVERIA ter, derivado da venda em vez de chutado.
 *
 * A regra: manter estoque para o tempo de reposição mais uma folga. Sem folga,
 * a peça chega a zero exatamente quando a reposição chega — e qualquer atraso
 * vira prateleira vazia.
 */
export function minimoSugerido(
  vendas: VendaMensal[],
  competenciaAtual: string,
  semanasParaRepor: number,
  folgaSemanas = 2,
): number | null {
  const { porSemana } = velocidadeSemanal(vendas, competenciaAtual)
  if (porSemana <= 0) return null
  return Math.ceil(porSemana * (semanasParaRepor + folgaSemanas))
}

/** `2026-07` a partir de uma data. */
export function competenciaDe(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`
}
