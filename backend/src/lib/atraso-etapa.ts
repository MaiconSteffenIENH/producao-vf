import { diaDoAtelie } from './agenda-calculo'

/*
 * LOTE PARADO ALÉM DO PREVISTO.
 *
 * O roteiro da peça diz quantos dias cada etapa leva (`diasEstimados`): a
 * secagem da Tortinha são 5 dias, a 2ª queima são 2. Até 17/09 esse número só
 * servia à previsão de conclusão; o quadro não dizia há quanto tempo o cartão
 * estava na coluna, e o João precisava lembrar de cabeça se a bandeja de
 * segunda já podia ir para o forno.
 *
 * A conta é de DIA, no fuso do ateliê, como a dos avisos (decisão 18): o lote
 * que entrou na secagem terça às 17h e é olhado quarta às 8h está lá há 1 dia,
 * não há 15 horas. E "previsto 5" quer dizer que no 5º dia ele vence e no 6º
 * já atrasou: é assim que a equipe conta.
 */

export type SituacaoNaEtapa = 'no_prazo' | 'vence_hoje' | 'atrasado'

export type PermanenciaNaEtapa = {
  /** dias inteiros de ateliê desde a entrada na etapa (0 = entrou hoje) */
  diasNaEtapa: number
  diasEstimados: number
  /** positivo = dias além do previsto; zero ou negativo = ainda dentro */
  atrasoDias: number
  situacao: SituacaoNaEtapa
}

const UM_DIA_MS = 24 * 60 * 60 * 1000

/** dias de calendário entre dois dias AAAA-MM-DD, sem fuso (os dois já são dias do ateliê) */
function diasEntre(deDia: string, ateDia: string): number {
  return Math.round((Date.parse(`${ateDia}T00:00:00Z`) - Date.parse(`${deDia}T00:00:00Z`)) / UM_DIA_MS)
}

export function permanenciaNaEtapa(entrouEm: Date, agora: Date, diasEstimados: number): PermanenciaNaEtapa {
  const diasNaEtapa = Math.max(0, diasEntre(diaDoAtelie(entrouEm), diaDoAtelie(agora)))
  const previsto = Math.max(0, diasEstimados)
  const atrasoDias = diasNaEtapa - previsto
  const situacao: SituacaoNaEtapa = atrasoDias > 0 ? 'atrasado' : atrasoDias === 0 ? 'vence_hoje' : 'no_prazo'
  return { diasNaEtapa, diasEstimados: previsto, atrasoDias, situacao }
}

/**
 * A data de entrada que vale é a do ÚLTIMO movimento que trouxe peça para a
 * etapa. Lote que voltou de "2ª Queima" para "Esmaltação" recomeça a contar
 * ali, porque é isso que aconteceu com a peça.
 */
export function ultimaEntrada(
  movimentos: readonly { etapaDestinoId: string | null; criadoEm: Date }[],
  etapaId: string,
): Date | null {
  let ultima: Date | null = null
  for (const m of movimentos) {
    if (m.etapaDestinoId !== etapaId) continue
    if (!ultima || m.criadoEm.getTime() > ultima.getTime()) ultima = m.criadoEm
  }
  return ultima
}

/** frase curta para o cartão: "3 dias aqui, previsto 5" ou "2 dias além do previsto (5)" */
export function fraseDaPermanencia(p: PermanenciaNaEtapa): string {
  const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`
  if (p.situacao === 'atrasado') return `${dias(p.atrasoDias)} além do previsto (${p.diasEstimados})`
  if (p.situacao === 'vence_hoje') return p.diasEstimados === 0 ? 'entrou hoje' : `vence hoje (previsto ${p.diasEstimados})`
  return p.diasNaEtapa === 0 ? `entrou hoje, previsto ${dias(p.diasEstimados)}` : `${dias(p.diasNaEtapa)} aqui, previsto ${p.diasEstimados}`
}
