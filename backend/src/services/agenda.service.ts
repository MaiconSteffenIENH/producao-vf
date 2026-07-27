import { prisma } from '../lib/prisma'
import { naoEncontrado } from '../lib/erros'
import { saldosPorLote } from './lote.service'
import {
  calcularAgenda,
  inicioDaSemana,
  inicioDoDia,
} from '../lib/agenda-calculo'

/*
 * Tarefas diárias com saldo rolante.
 *
 * O oleiro abre o app e vê quanto precisa fazer hoje. Se ontem ele não bateu a
 * meta, a diferença soma; se passou, abate. O saldo é calculado dentro da
 * SEMANA corrente e zera na segunda — sem isso, um mês ruim vira uma dívida
 * impagável na tela e a pessoa para de olhar.
 *
 * Nada aqui é digitado: o "realizado" sai dos movimentos que aquele
 * responsável registrou. A meta é consequência do trabalho, não um campo.
 */

export async function agendaDoResponsavel(responsavelId: string, agora = new Date()) {
  const responsavel = await prisma.responsavel.findUnique({ where: { id: responsavelId } })
  if (!responsavel) throw naoEncontrado('Responsável')

  const capacidade = responsavel.capacidadeDiaria ?? 0
  const comecoSemana = inicioDaSemana(agora)
  const comecoHoje = inicioDoDia(agora)
  const fimDaSemana = new Date(comecoSemana.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Só conta movimento que produz avanço; perda e divisão não são trabalho feito.
  const [movimentos, folgas] = await Promise.all([
    prisma.movimentoLote.findMany({
      where: {
        responsavelId,
        criadoEm: { gte: comecoSemana },
        tipo: { in: ['avanco', 'inicio'] },
      },
      select: { quantidade: true, criadoEm: true },
    }),
    prisma.folga.findMany({
      where: { responsavelId, data: { gte: comecoSemana, lt: fimDaSemana } },
      select: { data: true, motivo: true },
    }),
  ])

  const feitoHoje = movimentos
    .filter((m: { criadoEm: Date }) => m.criadoEm >= comecoHoje)
    .reduce((s: number, m: { quantidade: number }) => s + m.quantidade, 0)
  const feitoNaSemana = movimentos.reduce((s: number, m: { quantidade: number }) => s + m.quantidade, 0)

  // `data` é DATE puro: vem à meia-noite UTC, e é assim que a chave é montada
  const diasDeFolga = new Set<string>(
    (folgas as { data: Date }[]).map((f) => f.data.toISOString().slice(0, 10)),
  )

  const conta = calcularAgenda({
    capacidadeDiaria: capacidade,
    feitoHoje,
    feitoNaSemana,
    comecoSemana,
    comecoHoje,
    diasDeFolga,
  })

  return {
    responsavel: {
      id: responsavel.id,
      nome: responsavel.nome,
      cor: responsavel.cor,
      tipo: responsavel.tipo,
    },
    ...conta,
    explicacao:
      capacidade === 0
        ? 'Este responsável não tem capacidade diária cadastrada, então não há meta.'
        : conta.explicacao,
    folgas: (folgas as { data: Date; motivo: string }[]).map((f) => ({
      data: f.data.toISOString().slice(0, 10),
      motivo: f.motivo,
    })),
    fila: await filaDoResponsavel(responsavelId),
  }
}

/** O que está parado numa etapa cujo responsável é esta pessoa. */
async function filaDoResponsavel(responsavelId: string) {
  const roteiros = await prisma.roteiroEtapa.findMany({
    where: { responsavelId },
    include: { etapa: { select: { id: true, nome: true } }, peca: { select: { id: true, nome: true } } },
  })
  if (roteiros.length === 0) return []

  const etapasDaPessoa = new Map<string, Set<string>>() // pecaId → etapaIds
  for (const r of roteiros as { pecaId: string; etapaId: string }[]) {
    etapasDaPessoa.set(r.pecaId, (etapasDaPessoa.get(r.pecaId) ?? new Set()).add(r.etapaId))
  }

  const lotes = await prisma.lote.findMany({
    where: { canceladoEm: null, concluidoEm: null, pecaId: { in: [...etapasDaPessoa.keys()] } },
    include: {
      peca: { select: { id: true, nome: true } },
      cor: { select: { nome: true, hex: true } },
    },
  })
  const saldos = await saldosPorLote(lotes.map((l: { id: string }) => l.id))
  const nomeEtapa = new Map<string, string>(
    roteiros.map((r: { etapaId: string; etapa: { nome: string } }) => [r.etapaId, r.etapa.nome]),
  )

  const fila: {
    loteId: string
    codigo: string
    peca: string
    cor: string | null
    corHex: string | null
    etapaId: string
    etapa: string
    quantidade: number
  }[] = []

  for (const lote of lotes as {
    id: string
    codigo: string
    pecaId: string
    peca: { nome: string }
    cor: { nome: string; hex: string } | null
  }[]) {
    const minhas = etapasDaPessoa.get(lote.pecaId)
    if (!minhas) continue
    for (const [etapaId, quantidade] of saldos.get(lote.id) ?? []) {
      if (!minhas.has(etapaId)) continue
      fila.push({
        loteId: lote.id,
        codigo: lote.codigo,
        peca: lote.peca.nome,
        cor: lote.cor?.nome ?? null,
        corHex: lote.cor?.hex ?? null,
        etapaId,
        etapa: nomeEtapa.get(etapaId) ?? '?',
        quantidade,
      })
    }
  }

  return fila.sort((a, b) => b.quantidade - a.quantidade)
}

/** Painel com todo mundo — a Gabi olha isso para saber onde está o gargalo. */
export async function agendaDoDia(agora = new Date()) {
  const responsaveis = await prisma.responsavel.findMany({
    where: { ativo: true, capacidadeDiaria: { not: null } },
    orderBy: { nome: 'asc' },
    select: { id: true },
  })
  return Promise.all(responsaveis.map((r: { id: string }) => agendaDoResponsavel(r.id, agora)))
}

/*
 * FOLGA — dia em que a pessoa não trabalha.
 *
 * Sem isto o saldo rolante cobrava dia em que ninguém estava lá: o oleiro
 * faltava na quarta e a meta de quinta ficava impossível, com dívida que não
 * era dele. É o mesmo modo de falha que o reset de segunda evita, em escala
 * menor e mais injusta.
 */
export async function listarFolgas(responsavelId?: string) {
  return prisma.folga.findMany({
    where: responsavelId ? { responsavelId } : {},
    include: { responsavel: { select: { id: true, nome: true, cor: true } } },
    orderBy: { data: 'desc' },
    take: 200,
  })
}

export async function registrarFolga(dados: {
  responsavelId: string
  data: string
  motivo?: string
  observacao?: string | null
}) {
  // `data` chega como AAAA-MM-DD e é gravada como DATE puro: folga é dia
  // inteiro, e guardar hora só criaria confusão de fuso na comparação
  const data = new Date(`${dados.data}T00:00:00.000Z`)
  return prisma.folga.upsert({
    where: { responsavelId_data: { responsavelId: dados.responsavelId, data } },
    update: { motivo: dados.motivo ?? 'folga', observacao: dados.observacao ?? null },
    create: {
      responsavelId: dados.responsavelId,
      data,
      motivo: dados.motivo ?? 'folga',
      observacao: dados.observacao ?? null,
    },
  })
}

export async function apagarFolga(id: string) {
  await prisma.folga.delete({ where: { id } })
}
