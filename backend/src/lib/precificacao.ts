/**
 * Matemática da precificação. Pura de propósito: nada de banco aqui, para
 * conseguir testar a conta — que é a parte que decide se uma peça dá lucro ou
 * prejuízo — sem subir infraestrutura.
 */

export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))

export type EntradaCusto = {
  custoArgila: unknown
  custoEsmalte: unknown
  custoQueima: unknown
  custoEmbalagem: unknown
  minutosMaoDeObra: number
  custoHoraMaoDeObra: unknown
  outrosCustos: unknown
  perdaEstimadaPercentual: unknown
}

export type CustoDetalhado = {
  materialDireto: number
  maoDeObra: number
  custoUnitarioSemPerda: number
  perdaPercentual: number
  perdaOrigem: 'medida' | 'estimada'
  perdaAmostra: number
  custoUnitarioReal: number
}

/**
 * A perda é o que a maioria das calculadoras esquece. Se 100 peças entram no
 * forno e 12 não saem vendáveis, o custo das 100 se dilui em 88 — o custo real
 * de cada peça vendável é maior que o custo de produzir uma.
 */
export function calcularCusto(custo: EntradaCusto, perdaMedida?: { taxa: number; amostra: number }): CustoDetalhado {
  const materialDireto =
    num(custo.custoArgila) +
    num(custo.custoEsmalte) +
    num(custo.custoQueima) +
    num(custo.custoEmbalagem) +
    num(custo.outrosCustos)
  const maoDeObra = (custo.minutosMaoDeObra / 60) * num(custo.custoHoraMaoDeObra)
  const custoUnitarioSemPerda = materialDireto + maoDeObra

  const usaMedida = Boolean(perdaMedida)
  const perdaPercentual = usaMedida ? perdaMedida!.taxa * 100 : num(custo.perdaEstimadaPercentual)
  const aproveitamento = Math.max(0.01, 1 - perdaPercentual / 100)

  return {
    materialDireto,
    maoDeObra,
    custoUnitarioSemPerda,
    perdaPercentual,
    perdaOrigem: usaMedida ? 'medida' : 'estimada',
    perdaAmostra: perdaMedida?.amostra ?? 0,
    custoUnitarioReal: custoUnitarioSemPerda / aproveitamento,
  }
}

export type Faixa = {
  valorMinimo: unknown
  valorMaximo: unknown
  comissaoPercentual: unknown
  taxaFixa: unknown
  freteSubsidiado: unknown
}

export type Canal = {
  id: string
  nome: string
  comissaoPercentual: unknown
  taxaFixa: unknown
  freteSubsidiado: unknown
  percentualAds: unknown
  percentualImposto: unknown
  percentualAntecipacao: unknown
  margemAlvoPercentual: unknown
  faixas: Faixa[]
}

export class TaxasImpossiveis extends Error {}

/**
 * Preço tal que, depois de tudo que o canal desconta, sobre o custo mais a
 * margem alvo:
 *
 *   preco = (custo × (1 + margem) + taxaFixa + frete) / (1 − %variáveis)
 */
export function precoParaFaixa(custoReal: number, canal: Canal, faixa: Faixa | null) {
  const comissao = num(faixa ? faixa.comissaoPercentual : canal.comissaoPercentual)
  const taxaFixa = num(faixa ? faixa.taxaFixa : canal.taxaFixa)
  const frete = num(faixa ? faixa.freteSubsidiado : canal.freteSubsidiado)

  const variaveis =
    (comissao + num(canal.percentualAds) + num(canal.percentualImposto) + num(canal.percentualAntecipacao)) / 100

  if (variaveis >= 0.95) {
    throw new TaxasImpossiveis(
      `As taxas de ${canal.nome} somam ${Math.round(variaveis * 100)}% — não há preço que feche.`,
    )
  }

  const alvo = custoReal * (1 + num(canal.margemAlvoPercentual) / 100)
  return { preco: (alvo + taxaFixa + frete) / (1 - variaveis), comissao, taxaFixa, frete, variaveis }
}

export const dentroDaFaixa = (valor: number, faixa: Faixa) =>
  valor >= num(faixa.valorMinimo) && (faixa.valorMaximo === null || valor <= num(faixa.valorMaximo))

export const rotuloFaixa = (faixa: Faixa | null) =>
  !faixa
    ? 'taxa única do canal'
    : faixa.valorMaximo === null
      ? `acima de R$ ${num(faixa.valorMinimo).toFixed(2)}`
      : `R$ ${num(faixa.valorMinimo).toFixed(2)} a R$ ${num(faixa.valorMaximo).toFixed(2)}`

/**
 * O preço depende da faixa e a faixa depende do preço — Shopee cobra 20% + R$4
 * até R$79,99 e 14% + R$16 a partir de R$80. Resolvemos por ponto fixo: calcula
 * com cada faixa e fica com a que é consistente consigo mesma.
 */
export function resolverFaixa(custoReal: number, canal: Canal) {
  if (canal.faixas.length === 0) {
    return { ...precoParaFaixa(custoReal, canal, null), faixa: null as Faixa | null }
  }

  const ordenadas = [...canal.faixas].sort((a, b) => num(a.valorMinimo) - num(b.valorMinimo))

  for (const faixa of ordenadas) {
    const r = precoParaFaixa(custoReal, canal, faixa)
    if (dentroDaFaixa(r.preco, faixa)) return { ...r, faixa }
  }

  // Nenhuma fecha (o preço cai num buraco entre faixas): fica com a última,
  // que é a mais cara em taxa — errar para cima protege a margem.
  const ultima = ordenadas[ordenadas.length - 1]
  return { ...precoParaFaixa(custoReal, canal, ultima), faixa: ultima }
}
