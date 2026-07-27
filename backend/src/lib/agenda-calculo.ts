/**
 * A conta da meta diária com saldo rolante — extraída do serviço para ficar
 * testável sem banco.
 *
 * O que mudou: FOLGA.
 *
 * O saldo rolante zera toda segunda, de propósito — dívida de mês inteiro vira
 * número que ninguém olha. Mas dentro da semana não havia conceito de dia não
 * trabalhado: o oleiro faltava na quarta e a meta de quinta ficava impossível,
 * porque o sistema cobrava dele um dia em que ele não estava lá. É o mesmo modo
 * de falha que o reset semanal foi criado para evitar, só que em escala menor —
 * e mais injusto, porque a dívida não é dele.
 *
 * Agora o esperado só conta os dias em que a pessoa trabalhou.
 */

const DIA_MS = 24 * 60 * 60 * 1000
/** O ateliê é em Novo Hamburgo/RS. UTC-3, sem horário de verão desde 2019. */
const FUSO_ATELIE_MS = 3 * 60 * 60 * 1000

/** Segunda-feira 00:00 no fuso do ateliê. */
export function inicioDaSemana(agora: Date): Date {
  const local = new Date(agora.getTime() - FUSO_ATELIE_MS)
  const diaDaSemana = (local.getUTCDay() + 6) % 7 // 0 = segunda
  const segunda = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - diaDaSemana,
  )
  return new Date(segunda + FUSO_ATELIE_MS)
}

/** Meia-noite de hoje no fuso do ateliê. */
export function inicioDoDia(agora: Date): Date {
  const local = new Date(agora.getTime() - FUSO_ATELIE_MS)
  const meiaNoite = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  return new Date(meiaNoite + FUSO_ATELIE_MS)
}

/** AAAA-MM-DD no fuso do ateliê — a chave com que folga é comparada. */
export function diaDoAtelie(data: Date): string {
  const local = new Date(data.getTime() - FUSO_ATELIE_MS)
  return local.toISOString().slice(0, 10)
}

export type EntradaAgenda = {
  capacidadeDiaria: number
  feitoHoje: number
  feitoNaSemana: number
  comecoSemana: Date
  comecoHoje: Date
  /** dias AAAA-MM-DD de folga desta pessoa dentro da semana corrente */
  diasDeFolga: Set<string>
}

export type ResultadoAgenda = {
  capacidadeDiaria: number
  saldoAnterior: number
  metaDeHoje: number
  feitoHoje: number
  faltaHoje: number
  feitoNaSemana: number
  esperadoNaSemana: number
  /** dias trabalhados até ontem, já descontando folga */
  diasCobrados: number
  folgaHoje: boolean
  explicacao: string
}

export function calcularAgenda(entrada: EntradaAgenda): ResultadoAgenda {
  const { capacidadeDiaria: capacidade, feitoHoje, feitoNaSemana, comecoSemana, comecoHoje } = entrada

  const diasDecorridos = Math.round((comecoHoje.getTime() - comecoSemana.getTime()) / DIA_MS) + 1
  const folgaHoje = entrada.diasDeFolga.has(diaDoAtelie(comecoHoje))

  // conta quantos dias ANTES de hoje a pessoa efetivamente trabalhou
  let diasCobrados = 0
  for (let i = 0; i < diasDecorridos - 1; i++) {
    const dia = new Date(comecoSemana.getTime() + i * DIA_MS)
    if (!entrada.diasDeFolga.has(diaDoAtelie(dia))) diasCobrados++
  }

  const esperadoAteOntem = capacidade * diasCobrados
  const feitoAteOntem = feitoNaSemana - feitoHoje

  // negativo = devendo; positivo = adiantado
  const saldoAnterior = feitoAteOntem - esperadoAteOntem
  // em dia de folga a meta é zero: não se cobra trabalho de quem não está lá,
  // e o que ficou para trás espera o próximo dia útil sem virar cobrança hoje
  const metaDeHoje = folgaHoje ? 0 : Math.max(0, capacidade - saldoAnterior)
  const faltaHoje = Math.max(0, metaDeHoje - feitoHoje)

  // dias úteis restantes na semana, incluindo hoje
  let diasUteisNaSemana = 0
  for (let i = 0; i < 7; i++) {
    const dia = new Date(comecoSemana.getTime() + i * DIA_MS)
    if (!entrada.diasDeFolga.has(diaDoAtelie(dia))) diasUteisNaSemana++
  }

  return {
    capacidadeDiaria: capacidade,
    saldoAnterior,
    metaDeHoje,
    feitoHoje,
    faltaHoje,
    feitoNaSemana,
    esperadoNaSemana: capacidade * diasUteisNaSemana,
    diasCobrados,
    folgaHoje,
    explicacao: explicar(capacidade, saldoAnterior, folgaHoje, diasDecorridos - 1 - diasCobrados),
  }
}

function explicar(
  capacidade: number,
  saldoAnterior: number,
  folgaHoje: boolean,
  folgasNaSemana: number,
): string {
  if (folgaHoje) return 'Folga hoje. A meta não corre e nada vira dívida.'

  const sufixoFolga =
    folgasNaSemana > 0
      ? ` ${folgasNaSemana} dia${folgasNaSemana === 1 ? '' : 's'} de folga nesta semana não ${folgasNaSemana === 1 ? 'foi cobrado' : 'foram cobrados'}.`
      : ''

  if (saldoAnterior < 0) {
    const devendo = Math.abs(saldoAnterior)
    return `Meta base de ${capacidade}/dia mais ${devendo} que ${devendo === 1 ? 'ficou' : 'ficaram'} para trás nesta semana.${sufixoFolga}`
  }
  if (saldoAnterior > 0) {
    return `Meta base de ${capacidade}/dia menos ${saldoAnterior} adiantado${saldoAnterior === 1 ? '' : 's'} nesta semana.${sufixoFolga}`
  }
  return `Meta base de ${capacidade}/dia, em dia com a semana.${sufixoFolga}`
}
