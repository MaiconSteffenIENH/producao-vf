import { prisma } from '../lib/prisma'

/**
 * Resumo da Fase 1. Os números de produção (lotes, perdas, fila do dia) entram
 * na Fase 3 — os campos já saem aqui zerados com `disponivel: false` para o
 * front montar os cards agora e só ligar o dado depois.
 */
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

  // Peça sem roteiro não pode virar lote na Fase 3 — é o alerta mais útil que
  // o dashboard consegue dar enquanto a produção não existe.
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
    porCategoria: porCategoria.map((c) => ({ id: c.id, nome: c.nome, pecas: c._count.pecas })),
    producao: {
      disponivel: false,
      motivo: 'O módulo de produção entra na Fase 3.',
      emAndamento: 0,
      emBiscoito: 0,
      prontos: 0,
    },
  }
}
