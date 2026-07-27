import { describe, expect, it } from 'vitest'
import {
  alocarBiscoito,
  perdaDaPeca,
  quantidadeComPerda,
  type PedidoDeCor,
} from '../../src/lib/planejamento-calculo'

describe('quantidadeComPerda', () => {
  it('não é somar a perda, é dividir pelo aproveitamento', () => {
    // o erro comum: 100 + 20% = 120. Dessas 120, com 20% de perda, saem 96.
    // o certo é 125: 125 × 0,8 = 100
    expect(quantidadeComPerda(100, 20)).toBe(125)
    expect(Math.floor(125 * 0.8)).toBe(100)
  })

  it('arredonda para cima — meia peça não existe', () => {
    // 50 / 0,88 = 56,81
    expect(quantidadeComPerda(50, 12)).toBe(57)
  })

  it('sem perda, devolve a mesma quantidade', () => {
    expect(quantidadeComPerda(40, 0)).toBe(40)
  })

  it('não explode com perda absurda', () => {
    // com 99% a conta pediria 1000 para entregar 10; o teto de 95% segura
    expect(quantidadeComPerda(10, 99)).toBe(200)
    expect(quantidadeComPerda(10, 100)).toBe(200)
  })

  it('nada a produzir continua nada', () => {
    expect(quantidadeComPerda(0, 12)).toBe(0)
    expect(quantidadeComPerda(-5, 12)).toBe(0)
  })
})

describe('perdaDaPeca', () => {
  const mov = (tipo: string, quantidade: number) => ({ tipo, quantidade })

  it('usa a estimativa enquanto a amostra é pequena', () => {
    const r = perdaDaPeca([mov('inicio', 10), mov('perda', 8)], 12)
    // 80% de perda em 10 peças é azar de um lote, não é a verdade da peça
    expect(r.origem).toBe('estimada')
    expect(r.percentual).toBe(12)
    expect(r.amostra).toBe(10)
  })

  it('usa a perda medida quando há histórico', () => {
    const r = perdaDaPeca([mov('inicio', 200), mov('perda', 30)], 12)
    expect(r.origem).toBe('medida')
    expect(r.percentual).toBeCloseTo(15, 5)
    expect(r.amostra).toBe(200)
  })

  it('segunda qualidade NÃO conta como perda', () => {
    // a peça existe e vende; contá-la inflaria a taxa e, por ela, o custo
    const comSegunda = perdaDaPeca(
      [mov('inicio', 100), mov('perda', 10), mov('segunda', 15)],
      12,
    )
    const semSegunda = perdaDaPeca([mov('inicio', 100), mov('perda', 10)], 12)
    expect(comSegunda.percentual).toBe(semSegunda.percentual)
    expect(comSegunda.percentual).toBeCloseTo(10, 5)
  })

  it('ignora avanço e divisão', () => {
    const r = perdaDaPeca(
      [mov('inicio', 100), mov('avanco', 90), mov('divisao_saida', 40), mov('perda', 5)],
      12,
    )
    expect(r.percentual).toBeCloseTo(5, 5)
  })
})

describe('alocarBiscoito — o defeito que o planejamento tinha', () => {
  const pedido = (corNome: string, faltam: number, prontas: number): PedidoDeCor => ({
    corId: corNome.toLowerCase(),
    corNome,
    faltam,
    prontas,
  })

  it('nunca distribui mais biscoito do que existe', () => {
    // ERA O BUG: 20 em biscoito viravam 20+20+20 = 60 sugeridos
    const pedidos = [pedido('Pistache', 20, 0), pedido('Coral', 20, 0), pedido('Búzios', 20, 0)]
    const r = alocarBiscoito(pedidos, 20)
    const total = r.reduce((n, a) => n + a.alocado, 0)
    expect(total).toBe(20)
    expect(total).toBeLessThanOrEqual(20)
  })

  it('atende primeiro a cor zerada — é a que sumiu da loja', () => {
    const r = alocarBiscoito([pedido('Coral', 10, 8), pedido('Pistache', 10, 0)], 10)
    const pistache = r.find((a) => a.corNome === 'Pistache')!
    const coral = r.find((a) => a.corNome === 'Coral')!
    expect(pistache.alocado).toBe(10)
    expect(coral.alocado).toBe(0)
  })

  it('entre duas zeradas, atende primeiro quem precisa de menos', () => {
    // assim mais cores voltam para a prateleira com o mesmo biscoito
    const r = alocarBiscoito([pedido('Búzios', 100, 0), pedido('Coral', 5, 0)], 20)
    expect(r.find((a) => a.corNome === 'Coral')!.alocado).toBe(5)
    expect(r.find((a) => a.corNome === 'Búzios')!.alocado).toBe(15)
  })

  it('o que não coube vira "produzir do começo"', () => {
    const r = alocarBiscoito([pedido('Pistache', 30, 0)], 12)
    const p = r[0]
    expect(p.alocado).toBe(12)
    expect(p.semBiscoito).toBe(18)
    expect(p.alocado + p.semBiscoito).toBe(p.faltam)
  })

  it('sem biscoito nenhum, tudo vira produzir', () => {
    const r = alocarBiscoito([pedido('Pistache', 20, 0), pedido('Coral', 5, 0)], 0)
    expect(r.every((a) => a.alocado === 0)).toBe(true)
    expect(r.reduce((n, a) => n + a.semBiscoito, 0)).toBe(25)
  })

  it('biscoito de sobra atende todo mundo', () => {
    const r = alocarBiscoito([pedido('Pistache', 20, 0), pedido('Coral', 5, 2)], 500)
    expect(r.every((a) => a.semBiscoito === 0)).toBe(true)
    expect(r.reduce((n, a) => n + a.alocado, 0)).toBe(25)
  })

  it('a soma alocada nunca passa do disponível, com entradas aleatórias', () => {
    // propriedade que o código antigo violava por construção
    for (let caso = 0; caso < 200; caso++) {
      const n = 1 + (caso % 6)
      const pedidos = Array.from({ length: n }, (_, i) =>
        pedido(`Cor${i}`, ((caso * 7 + i * 13) % 50) + 1, (caso * 3 + i) % 4),
      )
      const disponivel = (caso * 11) % 80
      const r = alocarBiscoito(pedidos, disponivel)
      const total = r.reduce((s, a) => s + a.alocado, 0)
      expect(total).toBeLessThanOrEqual(disponivel)
      for (const a of r) {
        expect(a.alocado).toBeGreaterThanOrEqual(0)
        expect(a.alocado + a.semBiscoito).toBe(a.faltam)
      }
    }
  })

  it('não muda a lista que recebeu', () => {
    const pedidos = [pedido('Pistache', 20, 0), pedido('Coral', 5, 1)]
    const copia = JSON.parse(JSON.stringify(pedidos))
    alocarBiscoito(pedidos, 10)
    expect(pedidos).toEqual(copia)
  })
})
