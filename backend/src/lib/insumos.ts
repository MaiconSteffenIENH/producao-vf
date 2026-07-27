/**
 * INSUMO A PARTIR DO PLANO, não do mínimo.
 *
 * Antes, "comprar esmalte" só disparava quando o estoque JÁ estava baixo —
 * reação, não previsão. Esmalte tem prazo de entrega; descobrir a falta no dia
 * da esmaltação é tarde, e a fornada atrasa por causa de um pote.
 *
 * Aqui a compra vira consequência do plano: "o plano do mês pede 14 kg de
 * Pistache e há 1,2 kg".
 *
 * Puro de propósito — sem banco.
 */

export type ConsumoDeInsumo = {
  materiaPrimaId: string
  /** por peça, na unidade da matéria-prima */
  quantidadePorPeca: number
  /** insumo que só vale numa cor (esmalte Pistache só sai em lote Pistache) */
  corId: string | null
}

export type ItemDoPlano = {
  pecaId: string
  corId: string | null
  quantidade: number
}

export type EstoqueDeInsumo = {
  materiaPrimaId: string
  nome: string
  unidade: string
  estoqueAtual: number
  estoqueMinimo: number
  prazoEntregaDias: number
}

export type NecessidadeDeInsumo = {
  materiaPrimaId: string
  nome: string
  unidade: string
  necessario: number
  estoqueAtual: number
  estoqueMinimo: number
  /** quanto comprar para cobrir o plano e ainda respeitar o mínimo */
  comprar: number
  prazoEntregaDias: number
  /** o prazo de entrega não cabe antes da peça precisar do insumo */
  urgente: boolean
}

/** Arredonda para 3 casas — insumo é medido em kg com grama de precisão. */
const tresCasas = (n: number) => Math.round(n * 1000) / 1000

/**
 * Quanto de cada insumo o plano consome, e quanto falta comprar.
 *
 * `consumosPorPeca` é o cadastro (peça → insumos). Um insumo com `corId` só
 * entra quando o item do plano é daquela cor; um insumo sem `corId` vale para
 * qualquer cor (a argila é a mesma).
 *
 * `diasAteUsar` é quando o plano vai encostar no insumo. Se o prazo de entrega
 * for maior que isso, a compra é urgente — não porque o estoque está baixo,
 * mas porque o fornecedor não chega a tempo.
 */
export function necessidadeDeInsumos(
  plano: ItemDoPlano[],
  consumosPorPeca: Map<string, ConsumoDeInsumo[]>,
  estoques: Map<string, EstoqueDeInsumo>,
  diasAteUsar = 14,
): NecessidadeDeInsumo[] {
  const necessario = new Map<string, number>()

  for (const item of plano) {
    const consumos = consumosPorPeca.get(item.pecaId) ?? []
    for (const consumo of consumos) {
      // insumo amarrado a uma cor só conta quando o item é daquela cor
      if (consumo.corId !== null && consumo.corId !== item.corId) continue
      const total = consumo.quantidadePorPeca * item.quantidade
      necessario.set(consumo.materiaPrimaId, (necessario.get(consumo.materiaPrimaId) ?? 0) + total)
    }
  }

  const resultado: NecessidadeDeInsumo[] = []
  for (const [materiaPrimaId, quantidade] of necessario) {
    const estoque = estoques.get(materiaPrimaId)
    if (!estoque) continue
    // comprar o que falta para atender o plano E ainda deixar o mínimo em casa
    const faltante = quantidade + estoque.estoqueMinimo - estoque.estoqueAtual
    const comprar = tresCasas(Math.max(0, faltante))
    resultado.push({
      materiaPrimaId,
      nome: estoque.nome,
      unidade: estoque.unidade,
      necessario: tresCasas(quantidade),
      estoqueAtual: estoque.estoqueAtual,
      estoqueMinimo: estoque.estoqueMinimo,
      comprar,
      prazoEntregaDias: estoque.prazoEntregaDias,
      urgente: comprar > 0 && estoque.prazoEntregaDias >= diasAteUsar,
    })
  }

  // quem precisa comprar mais aparece primeiro; urgente sempre no topo
  return resultado.sort((a, b) => {
    if (a.urgente !== b.urgente) return a.urgente ? -1 : 1
    return b.comprar - a.comprar
  })
}
