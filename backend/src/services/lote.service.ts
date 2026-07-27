import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { conflito, invalido, naoEncontrado } from '../lib/erros'
import type { Sessao } from '../lib/token'

/*
 * O saldo de um lote em cada etapa é DERIVADO dos movimentos, nunca guardado
 * num campo. Entrada = movimento com etapaDestinoId igual à etapa; saída =
 * movimento com etapaOrigemId igual à etapa. Assim movimentação parcial,
 * perda e divisão funcionam sem nenhum caso especial, e o histórico nunca
 * discorda do saldo — porque ele É o saldo.
 */

export type SaldoEtapa = { etapaId: string; quantidade: number }

type MovimentoBruto = {
  loteId: string
  etapaOrigemId: string | null
  etapaDestinoId: string | null
  quantidade: number
}

export async function saldosPorLote(loteIds?: string[]): Promise<Map<string, Map<string, number>>> {
  const movimentos: MovimentoBruto[] = await prisma.movimentoLote.findMany({
    where: loteIds ? { loteId: { in: loteIds } } : undefined,
    select: { loteId: true, etapaOrigemId: true, etapaDestinoId: true, quantidade: true },
  })

  const porLote = new Map<string, Map<string, number>>()
  const somar = (loteId: string, etapaId: string, delta: number) => {
    const mapa = porLote.get(loteId) ?? new Map<string, number>()
    mapa.set(etapaId, (mapa.get(etapaId) ?? 0) + delta)
    porLote.set(loteId, mapa)
  }

  for (const m of movimentos) {
    if (m.etapaDestinoId) somar(m.loteId, m.etapaDestinoId, m.quantidade)
    if (m.etapaOrigemId) somar(m.loteId, m.etapaOrigemId, -m.quantidade)
  }

  // etapa zerada não aparece: card com 0 peça no Kanban só polui
  for (const [loteId, mapa] of porLote) {
    for (const [etapaId, qtd] of mapa) if (qtd <= 0) mapa.delete(etapaId)
    if (mapa.size === 0) porLote.delete(loteId)
  }
  return porLote
}

async function saldoNaEtapa(loteId: string, etapaId: string): Promise<number> {
  const saldos = await saldosPorLote([loteId])
  return saldos.get(loteId)?.get(etapaId) ?? 0
}

async function saldoTotal(loteId: string): Promise<number> {
  const saldos = await saldosPorLote([loteId])
  let total = 0
  for (const qtd of saldos.get(loteId)?.values() ?? []) total += qtd
  return total
}

/**
 * Código legível pra falar em voz alta no ateliê ("acabei o L-42").
 * Contador travado por UPDATE em vez de sequence: sequence pula número em
 * rollback e ficaria buraco na numeração colada na parede.
 */
async function proximoCodigo(tx: Prisma.TransactionClient): Promise<string> {
  const atual = await tx.contador.upsert({
    where: { nome: 'lote' },
    update: { valor: { increment: 1 } },
    create: { nome: 'lote', valor: 1 },
  })
  return `L-${String(atual.valor).padStart(4, '0')}`
}

const incluirLote = {
  peca: { select: { id: true, nome: true, categoria: { select: { nome: true } } } },
  cor: { select: { id: true, nome: true, hex: true, malhado: true, amostraUrl: true } },
  loteOrigem: { select: { id: true, codigo: true } },
}

async function roteiroDaPeca(pecaId: string) {
  const roteiro = await prisma.roteiroEtapa.findMany({
    where: { pecaId },
    orderBy: { ordem: 'asc' },
    include: { etapa: true },
  })
  if (roteiro.length === 0) {
    throw invalido('Esta peça não tem roteiro. Cadastre o roteiro antes de abrir um lote.')
  }
  return roteiro
}

// ─────────────────────────── Consultas ───────────────────────────

export async function listarLotes(filtros: {
  pecaId?: string
  corId?: string
  etapaId?: string
  responsavelId?: string
  situacao?: string
  mes?: string
}) {
  const [ano, mes] = (filtros.mes ?? '').split('-').map(Number)
  const periodo =
    ano && mes
      ? { gte: new Date(Date.UTC(ano, mes - 1, 1)), lt: new Date(Date.UTC(ano, mes, 1)) }
      : undefined

  const lotes = await prisma.lote.findMany({
    where: {
      ...(filtros.pecaId ? { pecaId: filtros.pecaId } : {}),
      ...(filtros.corId ? { corId: filtros.corId } : {}),
      ...(periodo ? { iniciadoEm: periodo } : {}),
      ...(filtros.situacao === 'andamento' ? { concluidoEm: null, canceladoEm: null } : {}),
      ...(filtros.situacao === 'concluido' ? { concluidoEm: { not: null } } : {}),
      ...(filtros.situacao === 'cancelado' ? { canceladoEm: { not: null } } : {}),
      ...(filtros.responsavelId ? { movimentos: { some: { responsavelId: filtros.responsavelId } } } : {}),
    },
    orderBy: { criadoEm: 'desc' },
    include: incluirLote,
  })

  const saldos = await saldosPorLote(lotes.map((l: { id: string }) => l.id))
  const etapas = await prisma.etapa.findMany()
  const nomeEtapa = new Map<string, string>(etapas.map((e: { id: string; nome: string }) => [e.id, e.nome]))

  const comSaldo = lotes.map((lote: { id: string }) => {
    const mapa = saldos.get(lote.id) ?? new Map<string, number>()
    const distribuicao = [...mapa.entries()].map(([etapaId, quantidade]) => ({
      etapaId,
      etapa: nomeEtapa.get(etapaId) ?? '?',
      quantidade,
    }))
    return {
      ...lote,
      saldoTotal: distribuicao.reduce((s, d) => s + d.quantidade, 0),
      distribuicao,
    }
  })

  if (!filtros.etapaId) return comSaldo
  return comSaldo.filter((l: { distribuicao: { etapaId: string }[] }) =>
    l.distribuicao.some((d) => d.etapaId === filtros.etapaId),
  )
}

export async function obterLote(id: string) {
  const lote = await prisma.lote.findUnique({
    where: { id },
    include: {
      ...incluirLote,
      divisoes: { select: { id: true, codigo: true, cor: { select: { nome: true, hex: true } } } },
      movimentos: {
        orderBy: { criadoEm: 'desc' },
        include: {
          etapaOrigem: { select: { id: true, nome: true } },
          etapaDestino: { select: { id: true, nome: true } },
          cor: { select: { nome: true, hex: true } },
          responsavel: { select: { nome: true, cor: true } },
        },
      },
    },
  })
  if (!lote) throw naoEncontrado('Lote')

  const roteiro = await prisma.roteiroEtapa.findMany({
    where: { pecaId: lote.pecaId },
    orderBy: { ordem: 'asc' },
    include: { etapa: true, responsavel: { select: { id: true, nome: true, cor: true } } },
  })
  const mapa = (await saldosPorLote([id])).get(id) ?? new Map<string, number>()

  return {
    ...lote,
    roteiro,
    distribuicao: roteiro.map((r: { etapaId: string; etapa: { nome: string } }) => ({
      etapaId: r.etapaId,
      etapa: r.etapa.nome,
      quantidade: mapa.get(r.etapaId) ?? 0,
    })),
    saldoTotal: [...mapa.values()].reduce((s, q) => s + q, 0),
    perdaTotal: lote.movimentos
      .filter((m: { tipo: string }) => m.tipo === 'perda')
      .reduce((s: number, m: { quantidade: number }) => s + m.quantidade, 0),
  }
}

/** Colunas do Kanban: as etapas ativas, cada uma com os lotes que têm saldo nela. */
export async function kanban(filtros: { pecaId?: string; corId?: string; responsavelId?: string }) {
  const etapas = await prisma.etapa.findMany({
    where: { ativo: true },
    orderBy: { ordemPadrao: 'asc' },
    include: { responsavelPadrao: { select: { id: true, nome: true, cor: true } } },
  })

  const lotes = await prisma.lote.findMany({
    where: {
      canceladoEm: null,
      ...(filtros.pecaId ? { pecaId: filtros.pecaId } : {}),
      ...(filtros.corId ? { corId: filtros.corId } : {}),
    },
    include: incluirLote,
  })

  const saldos = await saldosPorLote(lotes.map((l: { id: string }) => l.id))
  const roteiros = await prisma.roteiroEtapa.findMany({
    where: { pecaId: { in: [...new Set(lotes.map((l: { pecaId: string }) => l.pecaId))] } },
    orderBy: { ordem: 'asc' },
    include: { etapa: { select: { id: true, nome: true, defineCor: true } } },
  })

  type Roteiro = { pecaId: string; etapaId: string; ordem: number; responsavelId: string | null }
  const porPeca = new Map<string, Roteiro[]>()
  for (const r of roteiros as Roteiro[]) porPeca.set(r.pecaId, [...(porPeca.get(r.pecaId) ?? []), r])

  const colunas = etapas.map((etapa: { id: string; nome: string }) => {
    const cartoes = lotes
      .filter((lote: { id: string }) => (saldos.get(lote.id)?.get(etapa.id) ?? 0) > 0)
      .map((lote: { id: string; pecaId: string }) => {
        const roteiro = porPeca.get(lote.pecaId) ?? []
        const atual = roteiro.find((r) => r.etapaId === etapa.id)
        const proxima = atual ? roteiro.find((r) => r.ordem === atual.ordem + 1) : undefined
        return {
          ...lote,
          quantidade: saldos.get(lote.id)?.get(etapa.id) ?? 0,
          responsavelSugeridoId: atual?.responsavelId ?? null,
          proximaEtapaId: proxima?.etapaId ?? null,
        }
      })
    return {
      etapa,
      total: cartoes.reduce((s: number, c: { quantidade: number }) => s + c.quantidade, 0),
      cartoes,
    }
  })

  // etapa que nenhum lote usa e nenhum roteiro prevê só ocuparia espaço na tela
  const etapasEmUso = new Set(roteiros.map((r: { etapaId: string }) => r.etapaId))
  return colunas.filter(
    (c: { etapa: { id: string }; cartoes: unknown[] }) => c.cartoes.length > 0 || etapasEmUso.has(c.etapa.id),
  )
}

// ─────────────────────────── Comandos ───────────────────────────

export async function criarLote(
  dados: { pecaId: string; quantidade: number; observacao?: string | null; origem?: string },
  sessao: Sessao,
) {
  const roteiro = await roteiroDaPeca(dados.pecaId)
  const primeira = roteiro[0]

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const lote = await tx.lote.create({
      data: {
        codigo: await proximoCodigo(tx),
        pecaId: dados.pecaId,
        quantidadeInicial: dados.quantidade,
        origem: dados.origem ?? 'manual',
        observacao: dados.observacao || null,
      },
    })
    await tx.movimentoLote.create({
      data: {
        loteId: lote.id,
        etapaOrigemId: null,
        etapaDestinoId: primeira.etapaId,
        quantidade: dados.quantidade,
        tipo: 'inicio',
        responsavelId: primeira.responsavelId,
        usuarioId: sessao.id,
        usuarioNome: sessao.nome,
      },
    })
    return lote
  })
}

export async function avancarLote(
  dados: {
    loteId: string
    etapaOrigemId: string
    etapaDestinoId: string
    quantidade: number
    corId?: string | null
    responsavelId?: string | null
    motivo?: string | null
  },
  sessao: Sessao,
) {
  const lote = await prisma.lote.findUnique({ where: { id: dados.loteId } })
  if (!lote) throw naoEncontrado('Lote')
  if (lote.canceladoEm) throw conflito('Este lote foi cancelado.')

  const roteiro = await roteiroDaPeca(lote.pecaId)
  const origem = roteiro.find((r: { etapaId: string }) => r.etapaId === dados.etapaOrigemId)
  const destino = roteiro.find((r: { etapaId: string }) => r.etapaId === dados.etapaDestinoId)
  if (!origem || !destino) throw invalido('A etapa escolhida não faz parte do roteiro desta peça.')
  if (origem.etapaId === destino.etapaId) throw invalido('A etapa de destino é a mesma da origem.')

  const disponivel = await saldoNaEtapa(dados.loteId, dados.etapaOrigemId)
  if (dados.quantidade > disponivel) {
    throw conflito(`Só há ${disponivel} peça(s) em ${origem.etapa.nome}. Registre a perda antes, se for o caso.`)
  }

  const tipo = destino.ordem > origem.ordem ? 'avanco' : 'retorno'

  // ── cor ─────────────────────────────────────────────
  let corDoMovimento: string | null = lote.corId
  let loteAlvoId = lote.id
  let loteCriado: { id: string; codigo: string } | null = null

  if (destino.etapa.defineCor) {
    if (!dados.corId) throw invalido(`A etapa "${destino.etapa.nome}" define a cor — escolha o esmalte.`)

    const permitida = await prisma.pecaCor.findUnique({
      where: { pecaId_corId: { pecaId: lote.pecaId, corId: dados.corId } },
    })
    if (!permitida) throw invalido('Este esmalte não está liberado para esta peça. Ajuste no cadastro da peça.')

    if (lote.corId && lote.corId !== dados.corId) {
      throw conflito('Este lote já tem cor definida. Divida o lote antes de esmaltar em outra cor.')
    }
    corDoMovimento = dados.corId
  } else if (dados.corId && lote.corId && dados.corId !== lote.corId) {
    throw conflito('A cor informada não é a cor deste lote.')
  }

  const totalDoLote = await saldoTotal(dados.loteId)
  const precisaDividir = destino.etapa.defineCor && !lote.corId && dados.quantidade < totalDoLote

  const resultado = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (precisaDividir) {
      // parte do biscoito vai virar esta cor e o resto continua neutro:
      // nasce um lote-filho já com a cor, e o pai segue sem cor
      const filho = await tx.lote.create({
        data: {
          codigo: await proximoCodigo(tx),
          pecaId: lote.pecaId,
          corId: dados.corId,
          quantidadeInicial: dados.quantidade,
          origem: 'divisao',
          loteOrigemId: lote.id,
          observacao: `Separado de ${lote.codigo} para esmaltar.`,
        },
      })
      loteCriado = { id: filho.id, codigo: filho.codigo }
      loteAlvoId = filho.id

      await tx.movimentoLote.create({
        data: {
          loteId: lote.id,
          etapaOrigemId: dados.etapaOrigemId,
          etapaDestinoId: null,
          quantidade: dados.quantidade,
          tipo: 'divisao_saida',
          motivo: `Separado para ${filho.codigo}`,
          usuarioId: sessao.id,
          usuarioNome: sessao.nome,
        },
      })
      await tx.movimentoLote.create({
        data: {
          loteId: filho.id,
          etapaOrigemId: null,
          etapaDestinoId: dados.etapaOrigemId,
          quantidade: dados.quantidade,
          tipo: 'divisao_entrada',
          motivo: `Separado de ${lote.codigo}`,
          usuarioId: sessao.id,
          usuarioNome: sessao.nome,
        },
      })
    } else if (destino.etapa.defineCor && !lote.corId) {
      await tx.lote.update({ where: { id: lote.id }, data: { corId: dados.corId } })
    }

    const movimento = await tx.movimentoLote.create({
      data: {
        loteId: loteAlvoId,
        etapaOrigemId: dados.etapaOrigemId,
        etapaDestinoId: dados.etapaDestinoId,
        quantidade: dados.quantidade,
        tipo,
        corId: corDoMovimento,
        responsavelId: dados.responsavelId || destino.responsavelId,
        motivo: dados.motivo || null,
        usuarioId: sessao.id,
        usuarioNome: sessao.nome,
      },
    })

    return { movimento, loteCriado }
  })

  await atualizarConclusao(lote.id)
  if (resultado.loteCriado) await atualizarConclusao(resultado.loteCriado.id)
  return resultado
}

export async function registrarPerda(
  dados: { loteId: string; etapaId: string; quantidade: number; motivo: string },
  sessao: Sessao,
) {
  const lote = await prisma.lote.findUnique({ where: { id: dados.loteId } })
  if (!lote) throw naoEncontrado('Lote')

  const disponivel = await saldoNaEtapa(dados.loteId, dados.etapaId)
  if (dados.quantidade > disponivel) {
    throw conflito(`Só há ${disponivel} peça(s) nesta etapa.`)
  }

  const movimento = await prisma.movimentoLote.create({
    data: {
      loteId: dados.loteId,
      etapaOrigemId: dados.etapaId,
      etapaDestinoId: null,
      quantidade: dados.quantidade,
      tipo: 'perda',
      corId: lote.corId,
      motivo: dados.motivo,
      usuarioId: sessao.id,
      usuarioNome: sessao.nome,
    },
  })
  await atualizarConclusao(dados.loteId)
  return movimento
}

export async function dividirLote(
  dados: { loteId: string; etapaId: string; quantidade: number; motivo?: string | null },
  sessao: Sessao,
) {
  const lote = await prisma.lote.findUnique({ where: { id: dados.loteId } })
  if (!lote) throw naoEncontrado('Lote')

  const disponivel = await saldoNaEtapa(dados.loteId, dados.etapaId)
  if (dados.quantidade >= disponivel) {
    throw conflito(`Divida menos que o saldo da etapa (${disponivel}). Dividir tudo só renomearia o lote.`)
  }

  const filho = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const novo = await tx.lote.create({
      data: {
        codigo: await proximoCodigo(tx),
        pecaId: lote.pecaId,
        corId: lote.corId,
        quantidadeInicial: dados.quantidade,
        origem: 'divisao',
        loteOrigemId: lote.id,
        observacao: dados.motivo || `Dividido de ${lote.codigo}.`,
      },
    })
    await tx.movimentoLote.create({
      data: {
        loteId: lote.id,
        etapaOrigemId: dados.etapaId,
        etapaDestinoId: null,
        quantidade: dados.quantidade,
        tipo: 'divisao_saida',
        motivo: `Dividido para ${novo.codigo}`,
        usuarioId: sessao.id,
        usuarioNome: sessao.nome,
      },
    })
    await tx.movimentoLote.create({
      data: {
        loteId: novo.id,
        etapaOrigemId: null,
        etapaDestinoId: dados.etapaId,
        quantidade: dados.quantidade,
        tipo: 'divisao_entrada',
        corId: lote.corId,
        motivo: `Dividido de ${lote.codigo}`,
        usuarioId: sessao.id,
        usuarioNome: sessao.nome,
      },
    })
    return novo
  })

  await atualizarConclusao(lote.id)
  return filho
}

export async function cancelarLote(id: string, motivo: string, sessao: Sessao) {
  const lote = await prisma.lote.findUnique({ where: { id } })
  if (!lote) throw naoEncontrado('Lote')
  if (lote.concluidoEm) throw conflito('Lote já concluído não pode ser cancelado.')

  const saldos = (await saldosPorLote([id])).get(id) ?? new Map<string, number>()
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const [etapaId, quantidade] of saldos) {
      await tx.movimentoLote.create({
        data: {
          loteId: id,
          etapaOrigemId: etapaId,
          etapaDestinoId: null,
          quantidade,
          tipo: 'perda',
          motivo: `Lote cancelado: ${motivo}`,
          usuarioId: sessao.id,
          usuarioNome: sessao.nome,
        },
      })
    }
    return tx.lote.update({ where: { id }, data: { canceladoEm: new Date() } })
  })
}

/**
 * Conclusão é DERIVADA: o lote está pronto quando não sobrou nada em etapa
 * que não seja final. Ninguém marca caixinha — checkbox manual apodrece.
 */
async function atualizarConclusao(loteId: string) {
  const [saldos, etapas, lote] = await Promise.all([
    saldosPorLote([loteId]),
    prisma.etapa.findMany({ select: { id: true, tipo: true } }),
    prisma.lote.findUnique({ where: { id: loteId }, select: { concluidoEm: true } }),
  ])
  if (!lote) return

  const finais = new Set(
    etapas.filter((e: { tipo: string }) => e.tipo === 'final').map((e: { id: string }) => e.id),
  )
  const mapa = saldos.get(loteId) ?? new Map<string, number>()
  let emAberto = 0
  let prontos = 0
  for (const [etapaId, qtd] of mapa) {
    if (finais.has(etapaId)) prontos += qtd
    else emAberto += qtd
  }

  const concluido = emAberto === 0 && prontos > 0
  if (concluido && !lote.concluidoEm) {
    await prisma.lote.update({ where: { id: loteId }, data: { concluidoEm: new Date() } })
  } else if (!concluido && lote.concluidoEm) {
    // um retorno de etapa reabre o lote
    await prisma.lote.update({ where: { id: loteId }, data: { concluidoEm: null } })
  }
}
