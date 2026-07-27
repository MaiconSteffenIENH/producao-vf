import { prisma } from '../lib/prisma'
import { invalido } from '../lib/erros'
import { taxasDePerda } from './estoque.service'

/*
 * Precificação por canal.
 *
 * Duas coisas que a maioria das calculadoras erra e que aqui são tratadas:
 *
 * 1. A PERDA. Se 12% do que entra no forno não sai vendável, o custo real da
 *    peça que sobrou é o custo de todas dividido pelas que sobraram — não o
 *    custo de uma. Sem isso a margem é fantasia. Usamos a perda MEDIDA no
 *    livro-razão quando há amostra suficiente; senão, a estimada do cadastro.
 *
 * 2. A FAIXA DE PREÇO. Shopee e Mercado Livre mudam comissão e taxa fixa
 *    conforme o valor do produto, e o catálogo da VF (R$49 a R$283) atravessa
 *    essas fronteiras. Como o preço depende da faixa e a faixa depende do
 *    preço, resolvemos por ponto fixo: calcula com cada faixa e fica com a que
 *    é consistente consigo mesma.
 */

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))

export type CustoDetalhado = {
  materialDireto: number
  maoDeObra: number
  custoUnitarioSemPerda: number
  perdaPercentual: number
  perdaOrigem: 'medida' | 'estimada'
  perdaAmostra: number
  custoUnitarioReal: number
}

export function calcularCusto(
  custo: {
    custoArgila: unknown
    custoEsmalte: unknown
    custoQueima: unknown
    custoEmbalagem: unknown
    minutosMaoDeObra: number
    custoHoraMaoDeObra: unknown
    outrosCustos: unknown
    perdaEstimadaPercentual: unknown
  },
  perdaMedida?: { taxa: number; amostra: number },
): CustoDetalhado {
  const materialDireto =
    num(custo.custoArgila) + num(custo.custoEsmalte) + num(custo.custoQueima) + num(custo.custoEmbalagem) + num(custo.outrosCustos)
  const maoDeObra = (custo.minutosMaoDeObra / 60) * num(custo.custoHoraMaoDeObra)
  const custoUnitarioSemPerda = materialDireto + maoDeObra

  const usaMedida = Boolean(perdaMedida)
  const perdaPercentual = usaMedida ? perdaMedida!.taxa * 100 : num(custo.perdaEstimadaPercentual)

  // 100 peças começadas com 12% de perda entregam 88 vendáveis:
  // o custo das 100 é diluído em 88.
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

type Faixa = {
  valorMinimo: unknown
  valorMaximo: unknown
  comissaoPercentual: unknown
  taxaFixa: unknown
  freteSubsidiado: unknown
}

type Canal = {
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

export type PrecoSugerido = {
  canalId: string
  canal: string
  precoSugerido: number
  comissaoPercentual: number
  taxaFixa: number
  freteSubsidiado: number
  totalDescontos: number
  recebeLiquido: number
  lucro: number
  margemSobrePreco: number
  faixaAplicada: string
  precoAtual: number | null
  /** margem real do preço praticado hoje — negativa significa vender no prejuízo */
  margemAtual: number | null
  alerta: string | null
}

/**
 * Preço tal que, depois de comissão, taxa fixa, frete, ads e imposto, sobre o
 * custo mais a margem alvo:
 *
 *   preco = (custo * (1 + margem) + taxaFixa + frete) / (1 - %variáveis)
 */
function precoParaFaixa(custoReal: number, canal: Canal, faixa: Faixa | null) {
  const comissao = num(faixa ? faixa.comissaoPercentual : canal.comissaoPercentual)
  const taxaFixa = num(faixa ? faixa.taxaFixa : canal.taxaFixa)
  const frete = num(faixa ? faixa.freteSubsidiado : canal.freteSubsidiado)

  const variaveis =
    (comissao + num(canal.percentualAds) + num(canal.percentualImposto) + num(canal.percentualAntecipacao)) / 100

  if (variaveis >= 0.95) {
    throw invalido(`As taxas de ${canal.nome} somam ${Math.round(variaveis * 100)}% — não há preço que feche.`)
  }

  const alvo = custoReal * (1 + num(canal.margemAlvoPercentual) / 100)
  const preco = (alvo + taxaFixa + frete) / (1 - variaveis)
  return { preco, comissao, taxaFixa, frete, variaveis }
}

const dentro = (valor: number, faixa: Faixa) =>
  valor >= num(faixa.valorMinimo) && (faixa.valorMaximo === null || valor <= num(faixa.valorMaximo))

const rotuloFaixa = (faixa: Faixa | null) =>
  !faixa
    ? 'taxa única do canal'
    : faixa.valorMaximo === null
      ? `acima de R$ ${num(faixa.valorMinimo).toFixed(2)}`
      : `R$ ${num(faixa.valorMinimo).toFixed(2)} a R$ ${num(faixa.valorMaximo).toFixed(2)}`

function resolverFaixa(custoReal: number, canal: Canal) {
  if (canal.faixas.length === 0) return { ...precoParaFaixa(custoReal, canal, null), faixa: null as Faixa | null }

  const ordenadas = [...canal.faixas].sort((a, b) => num(a.valorMinimo) - num(b.valorMinimo))

  // ponto fixo: a faixa certa é aquela cujo preço calculado cai dentro dela
  for (const faixa of ordenadas) {
    const r = precoParaFaixa(custoReal, canal, faixa)
    if (dentro(r.preco, faixa)) return { ...r, faixa }
  }

  // nenhuma fecha (buraco entre faixas): fica com a de maior valor mínimo
  // cujo preço a ultrapassa — é a conservadora, cobra mais taxa
  const ultima = ordenadas[ordenadas.length - 1]
  return { ...precoParaFaixa(custoReal, canal, ultima), faixa: ultima }
}

export async function precificar(pecaId?: string) {
  const [pecas, canais, perdas] = await Promise.all([
    prisma.peca.findMany({
      where: { ativo: true, ...(pecaId ? { id: pecaId } : {}) },
      orderBy: { nome: 'asc' },
      include: {
        categoria: { select: { nome: true } },
        custo: { include: { precos: true } },
      },
    }),
    prisma.canalVenda.findMany({ where: { ativo: true }, orderBy: { ordem: 'asc' }, include: { faixas: true } }),
    taxasDePerda(),
  ])

  const resultado = pecas.map((peca: {
    id: string
    nome: string
    precoBase: unknown
    categoria: { nome: string }
    custo: (Parameters<typeof calcularCusto>[0] & { precos: { canalId: string; precoAtual: unknown }[] }) | null
  }) => {
    if (!peca.custo) {
      return {
        pecaId: peca.id,
        peca: peca.nome,
        categoria: peca.categoria.nome,
        precoBase: peca.precoBase === null ? null : num(peca.precoBase),
        custo: null,
        canais: [],
        aviso: 'Custo não cadastrado — sem isso não há preço a calcular.',
      }
    }

    const custo = calcularCusto(peca.custo, perdas.get(peca.id))
    const precosAtuais = new Map(
      peca.custo.precos.map((p) => [p.canalId, p.precoAtual === null ? null : num(p.precoAtual)]),
    )

    const porCanal: PrecoSugerido[] = canais.map((canal: Canal) => {
      const { preco, comissao, taxaFixa, frete, variaveis, faixa } = resolverFaixa(custo.custoUnitarioReal, canal)
      const precoSugerido = Math.ceil(preco * 100) / 100
      const descontos = precoSugerido * variaveis + taxaFixa + frete
      const liquido = precoSugerido - descontos
      const precoAtual = precosAtuais.get(canal.id) ?? null

      let margemAtual: number | null = null
      let alerta: string | null = null
      if (precoAtual !== null && precoAtual > 0) {
        const descontosAtuais = precoAtual * variaveis + taxaFixa + frete
        const lucroAtual = precoAtual - descontosAtuais - custo.custoUnitarioReal
        margemAtual = (lucroAtual / precoAtual) * 100
        if (lucroAtual < 0) {
          alerta = `Preço atual de R$ ${precoAtual.toFixed(2)} dá prejuízo de R$ ${Math.abs(lucroAtual).toFixed(2)} por peça.`
        } else if (precoAtual < precoSugerido * 0.9) {
          alerta = `Preço atual ${Math.round((1 - precoAtual / precoSugerido) * 100)}% abaixo do sugerido.`
        }
      }

      return {
        canalId: canal.id,
        canal: canal.nome,
        precoSugerido,
        comissaoPercentual: comissao,
        taxaFixa,
        freteSubsidiado: frete,
        totalDescontos: descontos,
        recebeLiquido: liquido,
        lucro: liquido - custo.custoUnitarioReal,
        margemSobrePreco: ((liquido - custo.custoUnitarioReal) / precoSugerido) * 100,
        faixaAplicada: rotuloFaixa(faixa),
        precoAtual,
        margemAtual,
        alerta,
      }
    })

    return {
      pecaId: peca.id,
      peca: peca.nome,
      categoria: peca.categoria.nome,
      precoBase: peca.precoBase === null ? null : num(peca.precoBase),
      custo,
      canais: porCanal,
      aviso: null as string | null,
    }
  })

  return { pecas: resultado, canais: canais.map((c: Canal) => ({ id: c.id, nome: c.nome })) }
}

// ─────────────────── cadastro de custo e preço praticado ───────────────────

export async function salvarCusto(
  pecaId: string,
  dados: {
    custoArgila: number
    custoEsmalte: number
    custoQueima: number
    custoEmbalagem: number
    minutosMaoDeObra: number
    custoHoraMaoDeObra: number
    outrosCustos: number
    perdaEstimadaPercentual: number
    precos?: { canalId: string; precoAtual?: number | null }[]
  },
) {
  const { precos = [], ...campos } = dados
  const custo = await prisma.custoPeca.upsert({
    where: { pecaId },
    update: campos,
    create: { pecaId, ...campos },
  })

  for (const p of precos) {
    if (!p.canalId) continue
    await prisma.precoCanal.upsert({
      where: { custoPecaId_canalId: { custoPecaId: custo.id, canalId: p.canalId } },
      update: { precoAtual: p.precoAtual ?? null },
      create: { custoPecaId: custo.id, canalId: p.canalId, precoAtual: p.precoAtual ?? null },
    })
  }
  return custo
}

export const listarCanais = () =>
  prisma.canalVenda.findMany({ orderBy: { ordem: 'asc' }, include: { faixas: { orderBy: { valorMinimo: 'asc' } } } })

type DadosCanal = {
  nome: string
  comissaoPercentual: number
  taxaFixa: number
  freteSubsidiado: number
  percentualAds: number
  percentualImposto: number
  percentualAntecipacao: number
  margemAlvoPercentual: number
  moeda: string
  observacao?: string | null
  ativo: boolean
  ordem: number
  faixas?: {
    valorMinimo: number
    valorMaximo?: number | null
    comissaoPercentual: number
    taxaFixa: number
    freteSubsidiado: number
  }[]
}

export async function salvarCanal(id: string | null, dados: DadosCanal) {
  const { faixas = [], ...campos } = dados
  const limpas = faixas
    .filter((f) => f.comissaoPercentual >= 0)
    .map((f) => ({ ...f, valorMaximo: f.valorMaximo ?? null }))

  if (id) {
    await prisma.faixaTaxaCanal.deleteMany({ where: { canalId: id } })
    return prisma.canalVenda.update({
      where: { id },
      data: { ...campos, observacao: campos.observacao || null, faixas: { create: limpas } },
      include: { faixas: true },
    })
  }
  return prisma.canalVenda.create({
    data: { ...campos, observacao: campos.observacao || null, faixas: { create: limpas } },
    include: { faixas: true },
  })
}

export async function excluirCanal(id: string) {
  await prisma.canalVenda.delete({ where: { id } })
}
