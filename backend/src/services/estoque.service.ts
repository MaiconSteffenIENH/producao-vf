import { prisma } from '../lib/prisma'
import { saldosPorLote } from './lote.service'

/**
 * Fotografia do que existe hoje, montada a partir dos saldos dos lotes.
 *
 * Três baldes que o planejamento precisa separar:
 *  - prontos   → etapa do tipo `final`, já com cor
 *  - biscoito  → etapa marcada como `estoqueIntermediario`, ainda SEM cor:
 *                é o pulmão que atende qualquer esmalte
 *  - emProducao→ todo o resto do caminho
 */
export type Estoque = {
  porPeca: Map<string, { prontos: number; biscoito: number; emProducao: number }>
  /** chave `${pecaId}:${corId}` */
  prontosPorCor: Map<string, number>
  /** chave `${pecaId}:${corId}` — já esmaltado mas ainda não pronto */
  emProducaoPorCor: Map<string, number>
}

export async function calcularEstoque(): Promise<Estoque> {
  const [lotes, etapas] = await Promise.all([
    prisma.lote.findMany({
      where: { canceladoEm: null },
      select: { id: true, pecaId: true, corId: true },
    }),
    prisma.etapa.findMany({ select: { id: true, tipo: true, estoqueIntermediario: true } }),
  ])

  const tipoEtapa = new Map<string, { final: boolean; biscoito: boolean }>(
    etapas.map((e: { id: string; tipo: string; estoqueIntermediario: boolean }) => [
      e.id,
      { final: e.tipo === 'final', biscoito: e.estoqueIntermediario },
    ]),
  )

  const saldos = await saldosPorLote(lotes.map((l: { id: string }) => l.id))

  const porPeca = new Map<string, { prontos: number; biscoito: number; emProducao: number }>()
  const prontosPorCor = new Map<string, number>()
  const emProducaoPorCor = new Map<string, number>()

  const acumular = (mapa: Map<string, number>, chave: string, valor: number) =>
    mapa.set(chave, (mapa.get(chave) ?? 0) + valor)

  for (const lote of lotes as { id: string; pecaId: string; corId: string | null }[]) {
    const mapa = saldos.get(lote.id)
    if (!mapa) continue

    const atual = porPeca.get(lote.pecaId) ?? { prontos: 0, biscoito: 0, emProducao: 0 }

    for (const [etapaId, quantidade] of mapa) {
      const tipo = tipoEtapa.get(etapaId)
      if (tipo?.final) {
        atual.prontos += quantidade
        if (lote.corId) acumular(prontosPorCor, `${lote.pecaId}:${lote.corId}`, quantidade)
      } else if (tipo?.biscoito && !lote.corId) {
        // biscoito COM cor já foi comprometido com um esmalte: conta como produção
        atual.biscoito += quantidade
      } else {
        atual.emProducao += quantidade
        if (lote.corId) acumular(emProducaoPorCor, `${lote.pecaId}:${lote.corId}`, quantidade)
      }
    }
    porPeca.set(lote.pecaId, atual)
  }

  return { porPeca, prontosPorCor, emProducaoPorCor }
}

/**
 * Taxa de perda real por peça, medida no livro-razão: perdidas ÷ (perdidas +
 * o que passou pela etapa final). Precisa de amostra mínima, senão um lote
 * azarado de 6 peças vira "50% de perda" e envenena a precificação.
 */
export async function taxasDePerda(minimoAmostra = 30): Promise<Map<string, { taxa: number; amostra: number }>> {
  const [movimentos, etapasFinais] = await Promise.all([
    prisma.movimentoLote.findMany({
      select: { tipo: true, quantidade: true, etapaDestinoId: true, lote: { select: { pecaId: true } } },
    }),
    prisma.etapa.findMany({ where: { tipo: 'final' }, select: { id: true } }),
  ])
  const finais = new Set(etapasFinais.map((e: { id: string }) => e.id))

  const perdas = new Map<string, number>()
  const concluidas = new Map<string, number>()

  for (const m of movimentos as {
    tipo: string
    quantidade: number
    etapaDestinoId: string | null
    lote: { pecaId: string }
  }[]) {
    const peca = m.lote.pecaId
    if (m.tipo === 'perda') perdas.set(peca, (perdas.get(peca) ?? 0) + m.quantidade)
    else if (m.etapaDestinoId && finais.has(m.etapaDestinoId)) {
      concluidas.set(peca, (concluidas.get(peca) ?? 0) + m.quantidade)
    }
  }

  const resultado = new Map<string, { taxa: number; amostra: number }>()
  for (const pecaId of new Set([...perdas.keys(), ...concluidas.keys()])) {
    const perdida = perdas.get(pecaId) ?? 0
    const pronta = concluidas.get(pecaId) ?? 0
    const amostra = perdida + pronta
    if (amostra < minimoAmostra) continue
    resultado.set(pecaId, { taxa: perdida / amostra, amostra })
  }
  return resultado
}
