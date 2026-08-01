import { prisma } from '../lib/prisma'
import { naoEncontrado, regraDeNegocio } from '../lib/erros'
import {
  montarCarga,
  recomendarQueima,
  situacaoDaCarga,
  type LoteEsperando,
} from '../lib/queima'
import { saldosPorLote } from './lote.service'
import { proximoCodigo } from './contador.service'

/*
 * O FORNO como carga, não como etapa.
 *
 * A fila de cada queima é derivada, como todo o resto do sistema: são os
 * saldos parados nas etapas marcadas com `aguardaCarga`. Ninguém digita "tem 68
 * peças esperando" — isso sai do livro-razão.
 */

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * Biscoito ou esmalte?
 *
 * Não dá para olhar o nome ("1ª Queima" pode ser renomeada) nem cravar número
 * de ordem. O que define é a POSIÇÃO em relação à etapa que decide a cor: antes
 * dela o lote é biscoito neutro, depois já está esmaltado. Essa é a regra que
 * o ateliê usa de verdade.
 */
function tipoDaEtapa(etapa: { ordemPadrao: number }, ordemDaCor: number): 'biscoito' | 'esmalte' {
  return etapa.ordemPadrao < ordemDaCor ? 'biscoito' : 'esmalte'
}

export type FilaDeQueima = {
  tipo: 'biscoito' | 'esmalte'
  etapaIds: string[]
  situacao: ReturnType<typeof situacaoDaCarga>
  recomendacao: ReturnType<typeof recomendarQueima>
  lotes: LoteEsperando[]
}

/**
 * Como está a fila de cada tipo de queima agora.
 *
 * Base da sugestão que nenhum ateliê calcula de cabeça: "faltam 12 para fechar
 * a carga, e essas 12 adiantam as outras 68".
 */
type EtapaCrua = {
  id: string
  nome: string
  defineCor: boolean
  ordemPadrao: number
  capacidadeCarga: number | null
}

export async function filaDasQueimas(agora = new Date()): Promise<FilaDeQueima[]> {
  const [etapas, etapaDaCor] = await Promise.all([
    // a capacidade vem DA ETAPA: o ateliê tem um forno para a 1ª queima e
    // outro para a 2ª, e eles não têm o mesmo tamanho
    prisma.etapa.findMany({
      where: { aguardaCarga: true, ativo: true },
      select: { id: true, nome: true, defineCor: true, ordemPadrao: true, capacidadeCarga: true },
    }),
    prisma.etapa.findFirst({ where: { defineCor: true, ativo: true } }),
  ])
  if (etapas.length === 0) return []

  const ordemDaCor = (etapaDaCor as { ordemPadrao: number } | null)?.ordemPadrao ?? Number.MAX_SAFE_INTEGER

  const saldos = await saldosPorLote()
  const listaEtapas = etapas as EtapaCrua[]
  const etapaIds = new Set(listaEtapas.map((e) => e.id))

  const lotes = await prisma.lote.findMany({
    where: { canceladoEm: null, concluidoEm: null },
    include: { peca: { select: { nome: true } } },
  })

  // último movimento de cada lote: é dele que sai "há quantos dias está parado"
  const ultimos = await prisma.movimentoLote.groupBy({
    by: ['loteId'],
    _max: { criadoEm: true },
  })
  const paradoDesde = new Map<string, Date | null>(
    (ultimos as { loteId: string; _max: { criadoEm: Date | null } }[]).map((u) => [
      u.loteId,
      u._max.criadoEm,
    ]),
  )

  const porTipo = new Map<
    'biscoito' | 'esmalte',
    { etapaIds: string[]; lotes: LoteEsperando[]; capacidade: number; forno: string | null }
  >()
  for (const etapa of listaEtapas) {
    const tipo = tipoDaEtapa(etapa, ordemDaCor)
    if (!porTipo.has(tipo)) {
      porTipo.set(tipo, { etapaIds: [], lotes: [], capacidade: 0, forno: null })
    }
    const grupo = porTipo.get(tipo)!
    grupo.etapaIds.push(etapa.id)
    // a maior capacidade entre as etapas do mesmo tipo — normalmente é uma só
    const cap = etapa.capacidadeCarga ?? 0
    if (cap > grupo.capacidade) {
      grupo.capacidade = cap
      grupo.forno = etapa.nome
    }
  }

  for (const lote of lotes as { id: string; codigo: string; iniciadoEm: Date; peca: { nome: string } }[]) {
    const doLote = saldos.get(lote.id)
    if (!doLote) continue
    for (const [etapaId, quantidade] of doLote) {
      if (!etapaIds.has(etapaId) || quantidade <= 0) continue
      const etapa = listaEtapas.find((e) => e.id === etapaId)!
      const tipo = tipoDaEtapa(etapa, ordemDaCor)
      const desde = paradoDesde.get(lote.id) ?? lote.iniciadoEm
      porTipo.get(tipo)!.lotes.push({
        loteId: lote.id,
        codigo: lote.codigo,
        pecaNome: lote.peca.nome,
        quantidade,
        diasParado: Math.max(0, Math.floor((agora.getTime() - desde.getTime()) / DIA_MS)),
      })
    }
  }

  return (
    [...porTipo.entries()]
      // sem capacidade cadastrada não há como falar de carga; melhor calar do
      // que chutar um número que a Vera vai tomar por verdade
      .filter(([, dados]) => dados.capacidade > 0)
      .map(([tipo, dados]) => {
        const situacao = situacaoDaCarga(dados.lotes, dados.capacidade)
        return {
          tipo,
          etapaIds: dados.etapaIds,
          situacao,
          recomendacao: recomendarQueima(situacao),
          lotes: dados.lotes.sort((a, b) => b.diasParado - a.diasParado),
        }
      })
  )
}

export async function listarQueimas(filtros: { status?: string } = {}) {
  return prisma.queima.findMany({
    where: filtros.status ? { status: filtros.status } : {},
    include: {
      forno: { select: { id: true, nome: true } },
      itens: {
        include: {
          lote: {
            include: { peca: { select: { nome: true } }, cor: { select: { nome: true, hex: true } } },
          },
        },
      },
    },
    orderBy: [{ criadoEm: 'desc' }],
    take: 60,
  })
}

/**
 * Abre uma fornada já montada com o que está esperando.
 *
 * A carga entra por ordem de espera — quem está parado há mais tempo primeiro.
 * Sem essa regra, um lote pequeno pode ficar eternamente fora porque sempre
 * chega um maior.
 */
export async function abrirQueima(dados: {
  tipo: 'biscoito' | 'esmalte'
  previstaPara?: string | null
  observacao?: string | null
  agora?: Date
}) {
  const agora = dados.agora ?? new Date()
  const filas = await filaDasQueimas(agora)
  const fila = filas.find((f) => f.tipo === dados.tipo)
  if (!fila) throw regraDeNegocio('Não há etapa de queima deste tipo configurada.')
  if (fila.lotes.length === 0) throw regraDeNegocio('Não há nada esperando esta queima.')

  // o forno é o da PRIMEIRA etapa desta fila — é dela que sai a capacidade
  const etapa = await prisma.etapa.findUnique({
    where: { id: fila.etapaIds[0] },
    select: { id: true, nome: true, capacidadeCarga: true },
  })
  const capacidade = etapa?.capacidadeCarga ?? 0
  if (capacidade <= 0) {
    throw regraDeNegocio(
      `Preencha "Capacidade por carga" na etapa ${etapa?.nome ?? 'de queima'}, em Etapas, ` +
        'antes de abrir uma fornada.',
    )
  }

  const carga = montarCarga(fila.lotes, capacidade)
  const codigo = await proximoCodigo('queima', 'Q')

  return prisma.queima.create({
    data: {
      codigo,
      tipo: dados.tipo,
      status: 'carregando',
      // o forno deixou de ser um responsável: quem executa a carga é a etapa
      fornoId: null,
      capacidade,
      previstaPara: dados.previstaPara ? new Date(dados.previstaPara) : null,
      observacao: dados.observacao ?? null,
      itens: { create: carga.map((c) => ({ loteId: c.loteId, quantidade: c.quantidade })) },
    },
    include: { itens: true },
  })
}

export async function atualizarStatusQueima(id: string, status: string, agora = new Date()) {
  const queima = await prisma.queima.findUnique({ where: { id } })
  if (!queima) throw naoEncontrado('Queima')

  const permitidos = ['planejada', 'carregando', 'queimando', 'concluida', 'cancelada']
  if (!permitidos.includes(status)) throw regraDeNegocio(`Status inválido: ${status}`)

  return prisma.queima.update({
    where: { id },
    data: {
      status,
      iniciadaEm: status === 'queimando' ? agora : queima.iniciadaEm,
      concluidaEm: status === 'concluida' ? agora : queima.concluidaEm,
    },
  })
}
