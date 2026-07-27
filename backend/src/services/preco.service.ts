import { prisma } from '../lib/prisma'
import { invalido } from '../lib/erros'
import {
  calcularCusto,
  num,
  resolverFaixa,
  rotuloFaixa,
  TaxasImpossiveis,
  type Canal,
  type CustoDetalhado,
} from '../lib/precificacao'
import { taxasDePerda } from './estoque.service'

/*
 * Precificação por canal. A matemática mora em `lib/precificacao.ts`, pura e
 * testável sem banco; aqui fica só a parte que fala com o Prisma.
 */

export type { CustoDetalhado }
export { calcularCusto }

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
      let calculo
      try {
        calculo = resolverFaixa(custo.custoUnitarioReal, canal)
      } catch (erro) {
        if (erro instanceof TaxasImpossiveis) throw invalido(erro.message)
        throw erro
      }
      const { preco, comissao, taxaFixa, frete, variaveis, faixa } = calculo
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
