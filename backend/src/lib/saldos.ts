/**
 * Agregação pura do livro-razão da produção. Sem banco, sem Prisma — por isso
 * dá para testar a regra mais crítica do sistema sem subir nada.
 *
 * Entrada = movimento com `etapaDestinoId`; saída = movimento com
 * `etapaOrigemId`. Um avanço tem os dois (sai de uma etapa, entra em outra);
 * uma perda só tem origem; a abertura do lote só tem destino.
 */

export type MovimentoBruto = {
  loteId: string
  etapaOrigemId: string | null
  etapaDestinoId: string | null
  quantidade: number
}

/** loteId → (etapaId → quantidade). Etapas zeradas não aparecem. */
export function calcularSaldos(movimentos: MovimentoBruto[]): Map<string, Map<string, number>> {
  const porLote = new Map<string, Map<string, number>>()

  const somar = (loteId: string, etapaId: string, delta: number) => {
    const mapa = porLote.get(loteId) ?? new Map<string, number>()
    mapa.set(etapaId, (mapa.get(etapaId) ?? 0) + delta)
    porLote.set(loteId, mapa)
  }

  for (const m of movimentos) {
    if (m.etapaDestinoId) somar(m.loteId, m.etapaDestinoId, m.quantidade)
    if (m.etapaOrigemId) somar(m.loteId, m.etapaOrigemId, -m.quantidade)
  }

  // etapa zerada não aparece: card com 0 peça no Kanban só polui
  for (const [loteId, mapa] of porLote) {
    for (const [etapaId, qtd] of mapa) if (qtd <= 0) mapa.delete(etapaId)
    if (mapa.size === 0) porLote.delete(loteId)
  }
  return porLote
}

export function saldoTotalDoLote(saldos: Map<string, Map<string, number>>, loteId: string): number {
  let total = 0
  for (const qtd of saldos.get(loteId)?.values() ?? []) total += qtd
  return total
}

export function saldoNaEtapa(
  saldos: Map<string, Map<string, number>>,
  loteId: string,
  etapaId: string,
): number {
  return saldos.get(loteId)?.get(etapaId) ?? 0
}
