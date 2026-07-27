import { prisma } from '../lib/prisma'
import { calcularEstoque } from './estoque.service'

/** Resumo do que está cadastrado, do que falta configurar e do que está na linha. */
export async function resumo() {
  const [pecasAtivas, pecasInativas, cores, coresAtivas, responsaveis, etapas, materiasPrimas] = await Promise.all([
    prisma.peca.count({ where: { ativo: true } }),
    prisma.peca.count({ where: { ativo: false } }),
    prisma.cor.count(),
    prisma.cor.count({ where: { ativo: true } }),
    prisma.responsavel.count({ where: { ativo: true } }),
    prisma.etapa.count({ where: { ativo: true } }),
    prisma.materiaPrima.count({ where: { ativo: true } }),
  ])

  // Peça sem roteiro não pode virar lote — o planejamento até sugere produzir,
  // mas na hora de abrir o lote o sistema recusa. Melhor avisar antes.
  const semRoteiro = await prisma.peca.findMany({
    where: { ativo: true, roteiro: { none: {} } },
    select: { id: true, nome: true, categoria: { select: { nome: true } } },
    orderBy: { nome: 'asc' },
  })

  // Peça sem nenhum esmalte associado nunca vai aparecer numa sugestão de
  // esmaltação, porque o planejamento raciocina por peça + cor.
  const semEsmalte = await prisma.peca.findMany({
    where: { ativo: true, cores: { none: {} } },
    select: { id: true, nome: true, categoria: { select: { nome: true } } },
    orderBy: { nome: 'asc' },
  })

  // Roteiro que não passa pela etapa que define a cor: o lote chegaria em
  // "Pronto" sem cor nenhuma e sumiria do controle por esmalte.
  const etapaCor = await prisma.etapa.findFirst({ where: { defineCor: true } })
  const semEtapaDeCor = etapaCor
    ? await prisma.peca.findMany({
        where: { ativo: true, roteiro: { some: {} }, NOT: { roteiro: { some: { etapaId: etapaCor.id } } } },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      })
    : []

  const porCategoria = await prisma.categoria.findMany({
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    select: { id: true, nome: true, _count: { select: { pecas: true } } },
  })

  return {
    cadastros: { pecasAtivas, pecasInativas, cores, coresAtivas, responsaveis, etapas, materiasPrimas },
    pendencias: {
      semRoteiro,
      semEsmalte,
      semEtapaDeCor,
      etapaQueDefineCor: etapaCor?.nome ?? null,
    },
    porCategoria: porCategoria.map((c: { id: string; nome: string; _count: { pecas: number } }) => ({
      id: c.id,
      nome: c.nome,
      pecas: c._count.pecas,
    })),
    producao: await resumoProducao(),
  }
}

async function resumoProducao() {
  const [estoque, lotesAbertos, lotesConcluidos, perdas30dias] = await Promise.all([
    calcularEstoque(),
    prisma.lote.count({ where: { canceladoEm: null, concluidoEm: null } }),
    prisma.lote.count({ where: { concluidoEm: { not: null } } }),
    prisma.movimentoLote.aggregate({
      where: { tipo: 'perda', criadoEm: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      _sum: { quantidade: true },
    }),
  ])

  let prontos = 0
  let biscoito = 0
  let emProducao = 0
  for (const v of estoque.porPeca.values()) {
    prontos += v.prontos
    biscoito += v.biscoito
    emProducao += v.emProducao
  }

  return {
    disponivel: true,
    lotesAbertos,
    lotesConcluidos,
    emProducao,
    emBiscoito: biscoito,
    prontos,
    perdas30dias: perdas30dias._sum.quantidade ?? 0,
  }
}
