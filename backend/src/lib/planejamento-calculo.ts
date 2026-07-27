/**
 * A matemática do planejamento. Pura de propósito: nada de banco aqui.
 *
 * Duas contas moram neste arquivo, e as duas estavam erradas antes:
 *
 * 1. ALOCAÇÃO DE BISCOITO. O mesmo biscoito era oferecido para todas as cores
 *    ao mesmo tempo — 20 peças em estoque viravam sugestão de esmaltar 20 em
 *    Pistache, 20 em Coral e 20 em Búzios. A Vera abria três lotes e só
 *    descobria na bancada.
 *
 * 2. PERDA. O plano dizia "faltam 50" e sugeria produzir 50. Com 12% de perda
 *    saem 44. Toda vez, para menos. O custo já sabia disso (precificacao.ts
 *    usa a perda medida); o plano não usava.
 */

// ─────────────────────────── perda ───────────────────────────

/**
 * Quantas peças COMEÇAR para que `desejadas` cheguem inteiras no fim.
 *
 * Não é "somar a perda": é dividir pelo aproveitamento. Com 20% de perda,
 * para ter 100 no fim não se começa 120 (dessas saem 96) — começa-se 125.
 */
export function quantidadeComPerda(desejadas: number, perdaPercentual: number): number {
  if (desejadas <= 0) return 0
  // 95% é o teto: acima disso a conta explode e o número deixa de ajudar
  // (com 99% de perda, 10 peças pediriam mil). Se o ateliê está perdendo mais
  // que isso, o problema não é de planejamento.
  const perda = Math.min(Math.max(perdaPercentual, 0), 95)
  return Math.ceil(desejadas / (1 - perda / 100))
}

export type PerdaDaPeca = {
  percentual: number
  origem: 'medida' | 'estimada'
  /** quantas peças entraram na conta — amostra pequena não vale confiança */
  amostra: number
}

/** Movimento cru do livro-razão, só o que a conta de perda precisa. */
export type MovimentoParaPerda = { tipo: string; quantidade: number }

/**
 * A perda REAL da peça, tirada do livro-razão.
 *
 * Mesma preferência que a precificação já usa: manda a medida quando há
 * histórico suficiente, cai na estimativa quando não há. `amostraMinima` evita
 * que um único lote azarado vire verdade — três peças perdidas de quatro não
 * significam 75% de perda.
 *
 * Movimento de `segunda` NÃO conta como perda, de propósito: a peça existe e
 * vende. Contá-la inflaria a taxa e, por ela, o custo de todas as outras.
 */
export function perdaDaPeca(
  movimentos: MovimentoParaPerda[],
  perdaEstimadaPercentual: number,
  amostraMinima = 30,
): PerdaDaPeca {
  let iniciadas = 0
  let perdidas = 0
  for (const m of movimentos) {
    if (m.tipo === 'inicio') iniciadas += m.quantidade
    else if (m.tipo === 'perda') perdidas += m.quantidade
  }
  if (iniciadas < amostraMinima) {
    return { percentual: perdaEstimadaPercentual, origem: 'estimada', amostra: iniciadas }
  }
  return {
    percentual: Math.min(95, (perdidas / iniciadas) * 100),
    origem: 'medida',
    amostra: iniciadas,
  }
}

// ─────────────────────── alocação de biscoito ───────────────────────

export type PedidoDeCor = {
  corId: string
  corNome: string
  /** quantas faltam para atingir o mínimo desta cor */
  faltam: number
  /** quantas já estão prontas nesta cor — zero é o caso urgente */
  prontas: number
}

export type AlocacaoDeCor = PedidoDeCor & {
  /** quanto do biscoito disponível coube para esta cor */
  alocado: number
  /** o que sobrou sem biscoito e vira "produzir do começo" */
  semBiscoito: number
}

/**
 * Reparte o biscoito neutro entre as cores que estão em falta.
 *
 * A REGRA, e o porquê dela: atende primeiro quem está **zerada**, porque cor
 * zerada é cor que sumiu da loja; e dentro desse grupo atende primeiro quem
 * precisa de **menos**, porque assim mais cores voltam para a prateleira com o
 * mesmo biscoito. Dar tudo para a cor mais faminta deixaria as outras zeradas.
 *
 * O saldo é corrente: cada cor consome do que sobrou, nunca do total.
 */
export function alocarBiscoito(pedidos: PedidoDeCor[], biscoitoDisponivel: number): AlocacaoDeCor[] {
  const ordenados = [...pedidos].sort((a, b) => {
    const urgenciaA = a.prontas === 0 ? 0 : 1
    const urgenciaB = b.prontas === 0 ? 0 : 1
    if (urgenciaA !== urgenciaB) return urgenciaA - urgenciaB
    if (a.faltam !== b.faltam) return a.faltam - b.faltam
    return a.corNome.localeCompare(b.corNome, 'pt-BR')
  })

  let restante = Math.max(0, biscoitoDisponivel)
  return ordenados.map((pedido) => {
    const alocado = Math.max(0, Math.min(pedido.faltam, restante))
    restante -= alocado
    return { ...pedido, alocado, semBiscoito: pedido.faltam - alocado }
  })
}
