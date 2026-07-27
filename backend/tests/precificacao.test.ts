import { describe, expect, it } from 'vitest'
import { calcularCusto, resolverFaixa, TaxasImpossiveis, type Canal } from '../src/lib/precificacao'

/**
 * Testes de unidade: rodam sem banco, sem Prisma, sem servidor.
 * É a conta que decide se uma peça dá lucro — vale ter prova.
 */

const canalBase = {
  id: 'c1',
  percentualAds: 0,
  percentualAntecipacao: 0,
  margemAlvoPercentual: 120,
}

// Taxas conferidas nas fontes públicas em julho/2026 (mesmas do seed).
const SHOPEE: Canal = {
  ...canalBase,
  nome: 'Shopee',
  comissaoPercentual: 14,
  taxaFixa: 20,
  freteSubsidiado: 0,
  percentualImposto: 6,
  faixas: [
    { valorMinimo: 0, valorMaximo: 7.99, comissaoPercentual: 50, taxaFixa: 0, freteSubsidiado: 0 },
    { valorMinimo: 8, valorMaximo: 79.99, comissaoPercentual: 20, taxaFixa: 4, freteSubsidiado: 0 },
    { valorMinimo: 80, valorMaximo: 99.99, comissaoPercentual: 14, taxaFixa: 16, freteSubsidiado: 0 },
    { valorMinimo: 100, valorMaximo: 199.99, comissaoPercentual: 14, taxaFixa: 20, freteSubsidiado: 0 },
    { valorMinimo: 200, valorMaximo: null, comissaoPercentual: 14, taxaFixa: 26, freteSubsidiado: 0 },
  ],
}

const LOJA: Canal = {
  ...canalBase,
  nome: 'Loja própria',
  comissaoPercentual: 0,
  taxaFixa: 0,
  freteSubsidiado: 25,
  percentualImposto: 6,
  percentualAntecipacao: 2,
  faixas: [],
}

const custoBase = {
  custoArgila: 3,
  custoEsmalte: 2,
  custoQueima: 4,
  custoEmbalagem: 2.5,
  minutosMaoDeObra: 30,
  custoHoraMaoDeObra: 30,
  outrosCustos: 0,
  perdaEstimadaPercentual: 10,
}

describe('custo com perda', () => {
  it('soma material e mão de obra proporcional aos minutos', () => {
    const c = calcularCusto({ ...custoBase, perdaEstimadaPercentual: 0 })
    expect(c.materialDireto).toBe(11.5)
    expect(c.maoDeObra).toBe(15) // 30 min a R$30/h
    expect(c.custoUnitarioSemPerda).toBe(26.5)
    expect(c.custoUnitarioReal).toBe(26.5)
  })

  it('dilui o custo das perdidas nas que sobraram', () => {
    // 100 peças a R$26,50 = R$2.650. Com 20% de perda sobram 80 vendáveis,
    // então cada uma carrega R$2.650 / 80 = R$33,125.
    const c = calcularCusto({ ...custoBase, perdaEstimadaPercentual: 20 })
    expect(c.custoUnitarioReal).toBeCloseTo(33.125, 3)
    expect(c.perdaOrigem).toBe('estimada')
  })

  it('prefere a perda medida quando ela existe', () => {
    const c = calcularCusto(custoBase, { taxa: 0.15, amostra: 120 })
    expect(c.perdaOrigem).toBe('medida')
    expect(c.perdaPercentual).toBe(15)
    expect(c.perdaAmostra).toBe(120)
    expect(c.custoUnitarioReal).toBeCloseTo(26.5 / 0.85, 4)
  })

  it('não explode com perda de 100% — trava o aproveitamento em 1%', () => {
    const c = calcularCusto({ ...custoBase, perdaEstimadaPercentual: 100 })
    expect(Number.isFinite(c.custoUnitarioReal)).toBe(true)
  })
})

describe('faixa de preço por ponto fixo', () => {
  it('escolhe a faixa que é consistente com o preço que ela mesma gera', () => {
    // custo real ~R$29,44 (26,50 com 10% de perda) · margem 120% → alvo ~R$64,78
    const custo = calcularCusto(custoBase).custoUnitarioReal
    expect(custo).toBeCloseTo(29.44, 2)

    const r = resolverFaixa(custo, SHOPEE)

    // Aqui está o motivo de existir o ponto fixo. As duas primeiras faixas
    // candidatas se auto-invalidam:
    //   faixa R$8–79,99  (20% + R$4)  → preço R$92,94, que já passou dos R$79,99
    //   faixa R$80–99,99 (14% + R$16) → preço R$100,98, que já passou dos R$99,99
    // A primeira que gera um preço dentro de si mesma é a de R$100–199,99.
    expect(r.comissao).toBe(14)
    expect(r.taxaFixa).toBe(20)
    expect(r.preco).toBeCloseTo(105.98, 1)
    expect(r.preco).toBeGreaterThanOrEqual(100)
    expect(r.preco).toBeLessThanOrEqual(199.99)
  })

  it('peça barata de verdade fica na faixa barata', () => {
    // custo baixo: o preço resultante cabe dentro da faixa de 20% + R$4
    const barata = calcularCusto({
      ...custoBase,
      custoArgila: 1,
      custoEsmalte: 0.5,
      custoQueima: 1,
      custoEmbalagem: 1,
      minutosMaoDeObra: 8,
    })
    const r = resolverFaixa(barata.custoUnitarioReal, SHOPEE)
    expect(r.comissao).toBe(20)
    expect(r.taxaFixa).toBe(4)
    expect(r.preco).toBeLessThanOrEqual(79.99)
  })

  it('peça cara cai na faixa de cima, com comissão menor e taxa fixa maior', () => {
    const caro = calcularCusto({ ...custoBase, custoArgila: 40, minutosMaoDeObra: 90 })
    const r = resolverFaixa(caro.custoUnitarioReal, SHOPEE)
    expect(r.comissao).toBe(14)
    expect(r.taxaFixa).toBe(26)
    expect(r.preco).toBeGreaterThan(200)
  })

  it('a conta fecha: o que sobra depois das taxas é custo + margem alvo', () => {
    const custo = calcularCusto(custoBase).custoUnitarioReal
    const { preco, variaveis, taxaFixa, frete } = resolverFaixa(custo, SHOPEE)
    const liquido = preco - (preco * variaveis + taxaFixa + frete)
    expect(liquido).toBeCloseTo(custo * 2.2, 6) // margem alvo de 120%
  })

  it('canal sem faixas usa a taxa única', () => {
    const custo = calcularCusto(custoBase).custoUnitarioReal
    const r = resolverFaixa(custo, LOJA)
    expect(r.faixa).toBeNull()
    expect(r.frete).toBe(25) // o frete grátis do site é custo nosso
    const liquido = r.preco - (r.preco * r.variaveis + r.taxaFixa + r.frete)
    expect(liquido).toBeCloseTo(custo * 2.2, 6)
  })

  it('avisa quando as taxas somadas não deixam preço nenhum fechar', () => {
    const impossivel: Canal = { ...LOJA, comissaoPercentual: 90, percentualImposto: 10, faixas: [] }
    expect(() => resolverFaixa(30, impossivel)).toThrow(TaxasImpossiveis)
  })
})

describe('o que isso significa para o catálogo da VF', () => {
  it('peça de ~R$49 na Shopee entrega bem menos do que o preço de etiqueta', () => {
    // Copinho de Café: R$49 no site. Na Shopee cai na faixa 20% + R$4.
    const preco = 49
    const comissao = 0.2
    const imposto = 0.06
    const taxaFixa = 4
    const recebe = preco - (preco * (comissao + imposto) + taxaFixa)
    expect(recebe).toBeCloseTo(32.26, 2)
    // mais de um terço do preço vai embora antes de pagar a argila
    expect(1 - recebe / preco).toBeGreaterThan(0.34)
  })
})
