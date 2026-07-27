import { prisma } from '../lib/prisma'
import { normalizarBusca } from '../lib/busca'
import { agruparVendas, lerCsvDeVendas, type LinhaVenda } from '../lib/csv-vendas'
import { calcularCobertura, competenciaDe, minimoSugerido, type VendaMensal } from '../lib/cobertura'
import { preverConclusao, semanasParaRepor, type EtapaDoRoteiro } from '../lib/previsao'
import { calcularEstoque } from './estoque.service'

/*
 * VENDA — o lado que faltava para responder o que o briefing pediu.
 *
 * Granularidade é o MÊS, de propósito: os marketplaces exportam planilha
 * mensal, e exigir data exata por pedido criaria digitação que ninguém faz.
 * O que o planejamento precisa é tendência, não centavo.
 */

export async function listarVendas(filtros: { competencia?: string; pecaId?: string } = {}) {
  return prisma.venda.findMany({
    where: {
      ...(filtros.competencia ? { competencia: filtros.competencia } : {}),
      ...(filtros.pecaId ? { pecaId: filtros.pecaId } : {}),
    },
    include: {
      peca: { select: { id: true, nome: true } },
      cor: { select: { id: true, nome: true, hex: true } },
      canal: { select: { id: true, nome: true } },
    },
    orderBy: [{ competencia: 'desc' }, { quantidade: 'desc' }],
    take: 500,
  })
}

export async function salvarVenda(dados: {
  pecaId: string
  corId?: string | null
  canalId?: string | null
  competencia: string
  quantidade: number
  valorTotal?: number | null
}) {
  const chave = {
    pecaId: dados.pecaId,
    corId: dados.corId ?? null,
    canalId: dados.canalId ?? null,
    competencia: dados.competencia,
  }
  // upsert pela competência: corrigir o mês é reenviar, não duplicar
  const existente = await prisma.venda.findFirst({ where: chave })
  if (existente) {
    return prisma.venda.update({
      where: { id: existente.id },
      data: { quantidade: dados.quantidade, valorTotal: dados.valorTotal ?? null },
    })
  }
  return prisma.venda.create({
    data: { ...chave, quantidade: dados.quantidade, valorTotal: dados.valorTotal ?? null },
  })
}

export async function apagarVenda(id: string) {
  await prisma.venda.delete({ where: { id } })
}

export type ResultadoImportacao = {
  importadas: number
  atualizadas: number
  naoReconhecidas: { peca: string; cor: string | null; quantidade: number; competencia: string }[]
  erros: { linha: number; motivo: string; conteudo: string }[]
  colunas: string[]
}

/**
 * Importa a planilha do marketplace.
 *
 * Peça que o sistema não conhece NÃO vira cadastro automático: viraria peça
 * duplicada a cada variação de nome no anúncio ("Bowl", "Bowl 15cm", "BOWL
 * artesanal"). Ela volta na lista de não reconhecidas para a Vera decidir.
 */
export async function importarVendas(
  conteudo: string,
  canalId: string | null,
  agora = new Date(),
): Promise<ResultadoImportacao> {
  const lido = lerCsvDeVendas(conteudo, agora.getUTCFullYear())
  const linhas = agruparVendas(lido.linhas)

  const [pecas, cores] = await Promise.all([
    prisma.peca.findMany({ select: { id: true, nome: true, nomeBusca: true } }),
    prisma.cor.findMany({ select: { id: true, nome: true, nomeBusca: true } }),
  ])

  type Nomeado = { id: string; nome: string; nomeBusca: string }
  const listaPecas = pecas as Nomeado[]
  const listaCores = cores as Nomeado[]

  const acharPeca = (nome: string) => {
    const alvo = normalizarBusca(nome)
    // exato primeiro; só depois "o nome da peça aparece dentro do título do
    // anúncio", que é como o marketplace costuma escrever
    return (
      listaPecas.find((p) => (p.nomeBusca || normalizarBusca(p.nome)) === alvo) ??
      listaPecas.find((p) => alvo.includes(p.nomeBusca || normalizarBusca(p.nome)))
    )
  }
  const acharCor = (nome: string | null) => {
    if (!nome) return null
    const alvo = normalizarBusca(nome)
    return (
      listaCores.find((c) => (c.nomeBusca || normalizarBusca(c.nome)) === alvo) ??
      listaCores.find((c) => alvo.includes(c.nomeBusca || normalizarBusca(c.nome))) ??
      null
    )
  }

  let importadas = 0
  let atualizadas = 0
  const naoReconhecidas: ResultadoImportacao['naoReconhecidas'] = []

  for (const linha of linhas as LinhaVenda[]) {
    const peca = acharPeca(linha.peca)
    if (!peca) {
      naoReconhecidas.push({
        peca: linha.peca,
        cor: linha.cor,
        quantidade: linha.quantidade,
        competencia: linha.competencia,
      })
      continue
    }
    const cor = acharCor(linha.cor)
    const chave = {
      pecaId: peca.id,
      corId: cor?.id ?? null,
      canalId,
      competencia: linha.competencia,
    }
    const existente = await prisma.venda.findFirst({ where: chave })
    if (existente) {
      await prisma.venda.update({
        where: { id: existente.id },
        data: { quantidade: linha.quantidade, valorTotal: linha.valorTotal, origem: 'importacao' },
      })
      atualizadas++
    } else {
      await prisma.venda.create({
        data: {
          ...chave,
          quantidade: linha.quantidade,
          valorTotal: linha.valorTotal,
          origem: 'importacao',
        },
      })
      importadas++
    }
  }

  return { importadas, atualizadas, naoReconhecidas, erros: lido.erros, colunas: lido.colunas }
}

/**
 * PRODUÇÃO versus VENDA, peça a peça. É a tela que o briefing pedia.
 *
 * Traz junto o mínimo SUGERIDO — o número que a Vera hoje chuta. Sugerir não é
 * aplicar: ela decide se aceita, e é por isso que os dois aparecem lado a lado.
 */
export async function compararProducaoComVendas(agora = new Date()) {
  const competencia = competenciaDe(agora)

  const [pecas, vendas, estoque, produzido] = await Promise.all([
    prisma.peca.findMany({
      where: { ativo: true },
      include: {
        roteiro: {
          include: {
            etapa: { select: { id: true, nome: true, aguardaCarga: true, estoqueIntermediario: true } },
          },
        },
      },
    }),
    prisma.venda.findMany({ select: { pecaId: true, competencia: true, quantidade: true } }),
    calcularEstoque(),
    // produzido = o que ENTROU em etapa final, por mês
    prisma.$queryRaw<{ peca_id: string; competencia: string; total: bigint }[]>`
      select l.peca_id,
             to_char(m.criado_em, 'YYYY-MM') as competencia,
             sum(m.quantidade)::bigint as total
      from movimentos_lote m
      join lotes l on l.id = m.lote_id
      join etapas e on e.id = m.etapa_destino_id
      where e.tipo = 'final' and m.tipo = 'avanco'
      group by l.peca_id, to_char(m.criado_em, 'YYYY-MM')
    `,
  ])

  const vendasDaPeca = new Map<string, VendaMensal[]>()
  for (const v of vendas) {
    const lista = vendasDaPeca.get(v.pecaId) ?? []
    lista.push({ competencia: v.competencia, quantidade: v.quantidade })
    vendasDaPeca.set(v.pecaId, lista)
  }
  const produzidoDaPeca = new Map<string, Map<string, number>>()
  for (const p of produzido) {
    const porMes = produzidoDaPeca.get(p.peca_id) ?? new Map()
    porMes.set(p.competencia, Number(p.total))
    produzidoDaPeca.set(p.peca_id, porMes)
  }

  type PecaComRoteiro = {
    id: string
    nome: string
    qtdMinimaDesejada: number
    roteiro: {
      ordem: number
      diasEstimados: number
      etapa: { id: string; nome: string; aguardaCarga: boolean; estoqueIntermediario: boolean }
    }[]
  }

  const linhas = (pecas as PecaComRoteiro[]).map((peca) => {
    const roteiro: EtapaDoRoteiro[] = peca.roteiro.map((r) => ({
      etapaId: r.etapa.id,
      nome: r.etapa.nome,
      ordem: r.ordem,
      diasEstimados: r.diasEstimados,
      aguardaCarga: r.etapa.aguardaCarga,
      estoqueIntermediario: r.etapa.estoqueIntermediario,
    }))
    const semanas = semanasParaRepor(preverConclusao(roteiro, 0))
    const minhasVendas = vendasDaPeca.get(peca.id) ?? []
    const atual = estoque.porPeca.get(peca.id) ?? { prontos: 0, biscoito: 0, emProducao: 0 }
    const cobertura = calcularCobertura(
      atual.prontos,
      minhasVendas,
      competencia,
      semanas,
      atual.emProducao,
    )
    const producao = produzidoDaPeca.get(peca.id) ?? new Map<string, number>()

    // últimos 6 meses fechados, para o gráfico da tela
    const meses: { competencia: string; vendido: number; produzido: number }[] = []
    for (let i = 6; i >= 1; i--) {
      const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i, 1))
      const c = competenciaDe(d)
      meses.push({
        competencia: c,
        vendido: minhasVendas.filter((v) => v.competencia === c).reduce((n, v) => n + v.quantidade, 0),
        produzido: producao.get(c) ?? 0,
      })
    }

    return {
      pecaId: peca.id,
      peca: peca.nome,
      prontas: atual.prontos,
      emProducao: atual.emProducao,
      biscoito: atual.biscoito,
      minimoAtual: peca.qtdMinimaDesejada,
      minimoSugerido: minimoSugerido(minhasVendas, competencia, semanas),
      semanasParaRepor: semanas,
      cobertura,
      meses,
    }
  })

  return {
    competencia,
    linhas: linhas.sort((a: (typeof linhas)[number], b: (typeof linhas)[number]) => {
      if (a.cobertura.vaiFaltar !== b.cobertura.vaiFaltar) return a.cobertura.vaiFaltar ? -1 : 1
      return (a.cobertura.semanas ?? 999) - (b.cobertura.semanas ?? 999)
    }),
  }
}
