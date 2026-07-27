import { prisma } from '../lib/prisma'
import { naoEncontrado } from '../lib/erros'
import { saldosPorLote } from './lote.service'

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

const DIA_MS = 24 * 60 * 60 * 1000

/** Segunda-feira 00:00 no fuso do ateliê (America/Sao_Paulo, UTC-3). */
function inicioDaSemana(agora: Date): Date {
  const local = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
  const diaDaSemana = (local.getUTCDay() + 6) % 7 // 0 = segunda
  const segunda = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - diaDaSemana)
  return new Date(segunda + 3 * 60 * 60 * 1000)
}

function inicioDoDia(agora: Date): Date {
  const local = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
  const meiaNoite = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  return new Date(meiaNoite + 3 * 60 * 60 * 1000)
}

export async function agendaDoResponsavel(responsavelId: string, agora = new Date()) {
  const responsavel = await prisma.responsavel.findUnique({ where: { id: responsavelId } })
  if (!responsavel) throw naoEncontrado('Responsável')

  const capacidade = responsavel.capacidadeDiaria ?? 0
  const comecoSemana = inicioDaSemana(agora)
  const comecoHoje = inicioDoDia(agora)

  // Só conta movimento que produz avanço; perda e divisão não são trabalho feito.
  const movimentos = await prisma.movimentoLote.findMany({
    where: {
      responsavelId,
      criadoEm: { gte: comecoSemana },
      tipo: { in: ['avanco', 'inicio'] },
    },
    select: { quantidade: true, criadoEm: true },
  })

  const feitoHoje = movimentos
    .filter((m: { criadoEm: Date }) => m.criadoEm >= comecoHoje)
    .reduce((s: number, m: { quantidade: number }) => s + m.quantidade, 0)
  const feitoNaSemana = movimentos.reduce((s: number, m: { quantidade: number }) => s + m.quantidade, 0)

  // dias já decorridos na semana, contando hoje
  const diasDecorridos = Math.floor((comecoHoje.getTime() - comecoSemana.getTime()) / DIA_MS) + 1
  const esperadoAteOntem = capacidade * (diasDecorridos - 1)
  const feitoAteOntem = feitoNaSemana - feitoHoje

  // negativo = devendo; positivo = adiantado
  const saldoAnterior = feitoAteOntem - esperadoAteOntem
  const metaDeHoje = Math.max(0, capacidade - saldoAnterior)
  const faltaHoje = Math.max(0, metaDeHoje - feitoHoje)

  return {
    responsavel: { id: responsavel.id, nome: responsavel.nome, cor: responsavel.cor, tipo: responsavel.tipo },
    capacidadeDiaria: capacidade,
    saldoAnterior,
    metaDeHoje,
    feitoHoje,
    faltaHoje,
    feitoNaSemana,
    esperadoNaSemana: capacidade * 5,
    explicacao:
      capacidade === 0
        ? 'Este responsável não tem capacidade diária cadastrada, então não há meta.'
        : saldoAnterior < 0
          ? `Meta base de ${capacidade}/dia mais ${Math.abs(saldoAnterior)} que ficaram para trás nesta semana.`
          : saldoAnterior > 0
            ? `Meta base de ${capacidade}/dia menos ${saldoAnterior} adiantados nesta semana.`
            : `Meta base de ${capacidade} peças por dia.`,
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
