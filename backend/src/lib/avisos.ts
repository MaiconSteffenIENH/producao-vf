/**
 * A SITUAÇÃO DE UM AVISO, e o estado do quadro inteiro.
 *
 * Toda a decisão de cor mora aqui, longe do banco e do navegador, porque é
 * regra de negócio disfarçada de detalhe visual: dizer que um aviso venceu é
 * afirmar que uma entrega foi perdida.
 *
 * A COMPARAÇÃO É DE DIA, NUNCA DE INSTANTE. O combinado com o cliente é "até
 * sexta", e sexta às 23h59 ainda é sexta. Comparar timestamps faria o card
 * ficar vermelho no meio da tarde de quinta, dependendo da hora em que o prazo
 * tivesse sido gravado — e a equipe aprenderia a ignorar a cor.
 *
 * O dia de referência é o do ateliê (Novo Hamburgo, UTC-3), não o do servidor:
 * o backend roda em UTC, e entre 21h e meia-noite o servidor já está no dia
 * seguinte enquanto o ateliê ainda não fechou. Sem isso, o aviso de hoje
 * apareceria como atrasado na frente de quem ainda tinha a tarde inteira.
 */

import { diaDoAtelie } from './agenda-calculo'

/** Ordem de urgência: quanto maior, mais grita. */
export const SITUACOES = ['concluido', 'programado', 'vence_hoje', 'atrasado'] as const
export type SituacaoDoAviso = (typeof SITUACOES)[number]

/**
 * O que o menu lateral precisa saber, e só isso.
 *
 * `nenhum` não é o mesmo que `concluido`: quadro sem nada aberto não pinta o
 * menu, mesmo que tenha cem avisos concluídos guardados.
 */
export type AlertaDoQuadro = 'nenhum' | 'programado' | 'vence_hoje' | 'atrasado'

export type EntradaDeAviso = {
  /** nulo é lembrete sem data marcada */
  prazo: Date | null
  concluidoEm: Date | null
}

export type LeituraDoAviso = {
  situacao: SituacaoDoAviso
  /**
   * Positivo = já passou; 0 = vence hoje; negativo = ainda falta.
   * `null` quando não há prazo — e é null mesmo, não um número sentinela:
   * `-Infinity` viraria `null` no JSON de qualquer jeito, só que em silêncio.
   */
  diasDeAtraso: number | null
  /** frase curta para o card, já pronta */
  urgencia: string
}

/**
 * Classifica um aviso.
 *
 * Concluído vence tudo: aviso feito na segunda não vira "atrasado" na terça só
 * porque o prazo passou. O que foi entregue está entregue.
 */
export function lerAviso(aviso: EntradaDeAviso, agora = new Date()): LeituraDoAviso {
  if (aviso.concluidoEm) {
    return { situacao: 'concluido', diasDeAtraso: 0, urgencia: 'feito' }
  }
  if (!aviso.prazo) {
    return { situacao: 'programado', diasDeAtraso: null, urgencia: 'sem data marcada' }
  }

  const dias = diasEntre(aviso.prazo, agora)
  if (dias > 0) {
    return {
      situacao: 'atrasado',
      diasDeAtraso: dias,
      urgencia: dias === 1 ? 'atrasado 1 dia' : `atrasado ${dias} dias`,
    }
  }
  if (dias === 0) return { situacao: 'vence_hoje', diasDeAtraso: 0, urgencia: 'é hoje' }

  const faltam = -dias
  return {
    situacao: 'programado',
    diasDeAtraso: dias,
    urgencia: faltam === 1 ? 'amanhã' : `em ${faltam} dias`,
  }
}

/**
 * Quantos dias inteiros separam o prazo de hoje, no calendário do ateliê.
 *
 * Faz a conta sobre as duas datas em texto AAAA-MM-DD e não sobre a diferença
 * de milissegundos: subtrair instantes e dividir por 24h erra por um dia
 * sempre que a diferença cai perto da meia-noite.
 *
 * OS DOIS LADOS SÃO LIDOS DE FORMA DIFERENTE, e não é descuido:
 *
 * `agora` é um INSTANTE. Para saber em que dia o ateliê está, ele precisa ser
 * convertido para o fuso de lá — é o que `diaDoAtelie` faz.
 *
 * `prazo` é um DIA DE CALENDÁRIO, coluna DATE. O banco devolve isso como
 * meia-noite UTC, um instante que não representa hora nenhuma. Aplicar o fuso
 * nele subtrai três horas de uma meia-noite e joga "5 de setembro" para o dia 4
 * — o card apareceria atrasado no próprio dia em que foi combinado.
 */
function diasEntre(prazo: Date, agora: Date): number {
  const hoje = emUTCdoDia(diaDoAtelie(agora))
  const alvo = emUTCdoDia(diaDeCalendario(prazo))
  return Math.round((hoje - alvo) / 86_400_000)
}

/** O dia que a coluna DATE guarda, lido sem fuso nenhum. */
function diaDeCalendario(data: Date): string {
  return data.toISOString().slice(0, 10)
}

function emUTCdoDia(iso: string): number {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return Date.UTC(ano, mes - 1, dia)
}

export type ResumoDoQuadro = {
  alerta: AlertaDoQuadro
  /** só os abertos; concluído não entra em contagem nenhuma */
  abertos: number
  venceHoje: number
  atrasados: number
  /** maior atraso em dias, para a tela poder dizer "há 3 dias" */
  piorAtraso: number
}

/**
 * O estado do quadro inteiro, que é o que pinta o menu.
 *
 * A pior situação manda: um único aviso atrasado deixa o menu no estado de
 * atraso mesmo que outros dez estejam em dia. Alerta que faz média não é
 * alerta — some justamente quando há muita coisa acontecendo.
 */
export function resumirQuadro(avisos: readonly EntradaDeAviso[], agora = new Date()): ResumoDoQuadro {
  let abertos = 0
  let venceHoje = 0
  let atrasados = 0
  let piorAtraso = 0

  for (const aviso of avisos) {
    const leitura = lerAviso(aviso, agora)
    if (leitura.situacao === 'concluido') continue
    abertos++
    if (leitura.situacao === 'vence_hoje') venceHoje++
    if (leitura.situacao === 'atrasado') {
      atrasados++
      piorAtraso = Math.max(piorAtraso, leitura.diasDeAtraso ?? 0)
    }
  }

  const alerta: AlertaDoQuadro =
    atrasados > 0 ? 'atrasado' : venceHoje > 0 ? 'vence_hoje' : abertos > 0 ? 'programado' : 'nenhum'

  return { alerta, abertos, venceHoje, atrasados, piorAtraso }
}

/**
 * A ordem em que os avisos aparecem no quadro.
 *
 * Atrasado no topo, depois o que vence hoje, depois o programado — e dentro de
 * cada grupo, o prazo mais curto primeiro. Aviso sem data desce para o fim do
 * seu grupo: ele não disputa atenção com o que tem hora marcada.
 *
 * Concluído sai da ordenação por completo e é assunto de outra lista.
 */
export function ordenarAvisos<T extends EntradaDeAviso>(avisos: readonly T[], agora = new Date()): T[] {
  const peso: Record<SituacaoDoAviso, number> = {
    atrasado: 0,
    vence_hoje: 1,
    programado: 2,
    concluido: 3,
  }
  // lê uma vez por aviso e ordena sobre a leitura: chamar lerAviso dentro do
  // comparador repetiria a mesma conta a cada comparação
  return avisos
    .map((aviso) => ({ aviso, leitura: lerAviso(aviso, agora) }))
    .sort((a, b) => {
      const pa = peso[a.leitura.situacao]
      const pb = peso[b.leitura.situacao]
      if (pa !== pb) return pa - pb
      // sem prazo desce para o fim do próprio grupo: não disputa atenção com
      // quem tem dia marcado
      const da = a.leitura.diasDeAtraso
      const db = b.leitura.diasDeAtraso
      if (da === null && db === null) return 0
      if (da === null) return 1
      if (db === null) return -1
      return db - da
    })
    .map((x) => x.aviso)
}
