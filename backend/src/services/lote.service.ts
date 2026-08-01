import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { conflito, invalido, naoEncontrado } from '../lib/erros'
import type { Sessao } from '../lib/token'
import { plural } from '../lib/plural'
import { avaliarExclusao } from '../lib/exclusao-lote'
import {
  calcularSaldos,
  saldoNaEtapa as saldoNaEtapaPuro,
  saldoTotalDoLote as saldoTotalPuro,
  type MovimentoBruto,
} from '../lib/saldos'
import {
  MOTIVO_NAO_INFORMADO,
  MOTIVO_QUALQUER,
  ehFiltroDeMotivo,
  ehMotivoDePerda,
  mensagemDeMotivoInvalido,
  resumoDeMotivos,
  type MovimentoDePerda,
} from '../lib/motivos-perda'

/*
 * O saldo de um lote em cada etapa é DERIVADO dos movimentos, nunca guardado
 * num campo. Entrada = movimento com etapaDestinoId igual à etapa; saída =
 * movimento com etapaOrigemId igual à etapa. Assim movimentação parcial,
 * perda e divisão funcionam sem nenhum caso especial, e o histórico nunca
 * discorda do saldo — porque ele É o saldo.
 */

export type { MovimentoBruto }

export async function saldosPorLote(loteIds?: string[]): Promise<Map<string, Map<string, number>>> {
  const movimentos: MovimentoBruto[] = await prisma.movimentoLote.findMany({
    where: loteIds ? { loteId: { in: loteIds } } : undefined,
    select: { loteId: true, etapaOrigemId: true, etapaDestinoId: true, quantidade: true },
  })
  return calcularSaldos(movimentos)
}

async function saldoNaEtapa(loteId: string, etapaId: string): Promise<number> {
  return saldoNaEtapaPuro(await saldosPorLote([loteId]), loteId, etapaId)
}

async function saldoTotal(loteId: string): Promise<number> {
  return saldoTotalPuro(await saldosPorLote([loteId]), loteId)
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

type MovimentoDePerdaDoLote = MovimentoDePerda & { loteId: string }

/*
 * O FILTRO DE PERDA DO HISTÓRICO.
 *
 * São duas perguntas com a mesma cara, e o histórico não respondia nenhuma:
 * "quais lotes perderam peça" e "quais lotes trincaram na secagem". A segunda é
 * o pedido; a primeira é o caminho até ela — sem um jeito de ver só o que teve
 * perda, achar o lote problemático era rolar a lista inteira lote a lote.
 *
 * `some` e não contagem: um único movimento de perda daquele motivo já torna o
 * lote interessante. E o valor desconhecido é recusado em vez de ignorado —
 * filtro que devolve o ateliê inteiro parece filtro que não achou nada, e a
 * pessoa conclui que o problema não existe.
 */
function condicaoDePerda(motivoPerda: string | undefined): Record<string, unknown> {
  if (!motivoPerda) return {}
  // recusa antes de traduzir: valor inventado vira erro em pt-BR, não filtro vazio
  if (!ehFiltroDeMotivo(motivoPerda)) throw invalido(mensagemDeMotivoInvalido(motivoPerda))
  if (motivoPerda === MOTIVO_QUALQUER) return { movimentos: { some: { tipo: 'perda' } } }
  if (motivoPerda === MOTIVO_NAO_INFORMADO) {
    return { movimentos: { some: { tipo: 'perda', motivoTipo: null } } }
  }
  return { movimentos: { some: { tipo: 'perda', motivoTipo: motivoPerda } } }
}

export async function listarLotes(filtros: {
  pecaId?: string
  corId?: string
  etapaId?: string
  responsavelId?: string
  situacao?: string
  mes?: string
  /** um motivo da lista, `nao_informado`, ou `qualquer` para "só o que perdeu" */
  motivoPerda?: string
}) {
  const [ano, mes] = (filtros.mes ?? '').split('-').map(Number)
  const periodo =
    ano && mes
      ? { gte: new Date(Date.UTC(ano, mes - 1, 1)), lt: new Date(Date.UTC(ano, mes, 1)) }
      : undefined

  const condicoesDeMovimento: Record<string, unknown>[] = []
  if (filtros.responsavelId) {
    condicoesDeMovimento.push({ movimentos: { some: { responsavelId: filtros.responsavelId } } })
  }
  const porMotivo = condicaoDePerda(filtros.motivoPerda)
  if (Object.keys(porMotivo).length > 0) condicoesDeMovimento.push(porMotivo)

  const lotes = await prisma.lote.findMany({
    where: {
      ...(filtros.pecaId ? { pecaId: filtros.pecaId } : {}),
      ...(filtros.corId ? { corId: filtros.corId } : {}),
      ...(periodo ? { iniciadoEm: periodo } : {}),
      ...(filtros.situacao === 'andamento' ? { concluidoEm: null, canceladoEm: null } : {}),
      ...(filtros.situacao === 'concluido' ? { concluidoEm: { not: null } } : {}),
      ...(filtros.situacao === 'cancelado' ? { canceladoEm: { not: null } } : {}),
      /*
       * Os dois filtros abaixo falam da MESMA relação (`movimentos`), e num
       * objeto literal a última chave apaga a primeira em silêncio: filtrar
       * por responsável E por motivo de perda devolvia todo lote com aquele
       * motivo, inclusive os que a pessoa nunca encostou. `AND` mantém os dois
       * como condições independentes, cada uma com o seu próprio `some`.
       */
      ...(condicoesDeMovimento.length > 0 ? { AND: condicoesDeMovimento } : {}),
    },
    orderBy: { criadoEm: 'desc' },
    include: incluirLote,
  })

  const ids = lotes.map((l: { id: string }) => l.id)
  const saldos = await saldosPorLote(ids)
  const etapas = await prisma.etapa.findMany()
  const nomeEtapa = new Map<string, string>(etapas.map((e: { id: string; nome: string }) => [e.id, e.nome]))

  /*
   * As perdas vêm numa consulta só, para o ateliê inteiro. Filtrar por motivo
   * sem mostrar o motivo na linha seria meio recurso — mas buscar as perdas
   * lote a lote transformaria a tela mais cheia do sistema num N+1.
   */
  const perdas: MovimentoDePerdaDoLote[] = await prisma.movimentoLote.findMany({
    where: { loteId: { in: ids }, tipo: 'perda' },
    select: { loteId: true, quantidade: true, motivoTipo: true },
  })
  const perdasPorLote = new Map<string, MovimentoDePerda[]>()
  for (const p of perdas) {
    const doLote = perdasPorLote.get(p.loteId)
    if (doLote) doLote.push(p)
    else perdasPorLote.set(p.loteId, [p])
  }

  const comSaldo = lotes.map((lote: { id: string }) => {
    const mapa = saldos.get(lote.id) ?? new Map<string, number>()
    const distribuicao = [...mapa.entries()].map(([etapaId, quantidade]) => ({
      etapaId,
      etapa: nomeEtapa.get(etapaId) ?? '?',
      quantidade,
    }))
    const perda = resumoDeMotivos(perdasPorLote.get(lote.id) ?? [])
    return {
      ...lote,
      saldoTotal: distribuicao.reduce((s, d) => s + d.quantidade, 0),
      distribuicao,
      perdaTotal: perda.total,
      // o campeão vem mastigado porque é o que a linha da tabela mostra sem
      // abrir o lote — e ele ignora o "não informado", que não responde nada
      perdaPrincipal: perda.principal,
      perdaPorMotivo: perda.ranking,
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

  /*
   * O ranking sai daqui e não da tela: é a mesma conta que a listagem já faz, e
   * duas contas de porcentagem discordam no primeiro arredondamento — aí a
   * mesma perda vira 38% numa tela e 37,5% na outra, e o número perde a
   * autoridade que era o motivo de existir.
   */
  const perda = resumoDeMotivos(
    lote.movimentos
      .filter((m: { tipo: string }) => m.tipo === 'perda')
      .map((m: { quantidade: number; motivoTipo: string | null }) => ({
        quantidade: m.quantidade,
        motivoTipo: m.motivoTipo,
      })),
  )

  return {
    ...lote,
    roteiro,
    distribuicao: roteiro.map((r: { etapaId: string; etapa: { nome: string } }) => ({
      etapaId: r.etapaId,
      etapa: r.etapa.nome,
      quantidade: mapa.get(r.etapaId) ?? 0,
    })),
    saldoTotal: [...mapa.values()].reduce((s, q) => s + q, 0),
    perdaTotal: perda.total,
    perdaPorMotivo: perda.ranking,
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
          /*
           * Para onde ESTE cartão pode ir. Sai daqui e não da tela porque quem
           * conhece o roteiro da peça é o backend — `avancarLote` recusa etapa
           * fora dele. Mandando a lista junto, o arrasto acende só as colunas
           * que aceitam o cartão, em vez de deixar a pessoa soltar e tomar erro.
           */
          destinosPermitidos: roteiro
            .filter((r) => r.etapaId !== etapa.id)
            .map((r) => r.etapaId),
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
  dados: {
    pecaId: string
    quantidade: number
    observacao?: string | null
    origem?: string
    /** lote nascido de encomenda herda o prazo dela e passa na frente */
    encomendaId?: string | null
  },
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
        encomendaId: dados.encomendaId ?? null,
        observacao: dados.observacao || null,
      },
    })
    // a encomenda passa a "em produção" assim que o primeiro lote dela nasce
    if (dados.encomendaId) {
      await tx.encomenda.updateMany({
        where: { id: dados.encomendaId, status: 'aberta' },
        data: { status: 'em_producao' },
      })
    }
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

/*
 * IDEMPOTÊNCIA — o que torna a fila offline segura.
 *
 * O ateliê tem sinal ruim. O oleiro registra 40 peças, a requisição sai, o
 * sinal cai antes da resposta voltar, a fila local reenvia. Sem esta checagem
 * o reenvio grava 80. E num livro-razão append-only movimento duplicado não se
 * apaga: se corrige com estorno, e o histórico fica sujo para sempre.
 *
 * A chave é gerada pelo CLIENTE antes de mandar, exatamente para sobreviver ao
 * caso em que a resposta nunca chega.
 */
async function movimentoJaGravado(chave: string | null | undefined) {
  if (!chave) return null
  return prisma.movimentoLote.findUnique({ where: { chaveIdempotencia: chave } })
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
    chaveIdempotencia?: string | null
  },
  sessao: Sessao,
) {
  // reenvio da fila offline: devolve o que já foi gravado, no MESMO formato
  // que a chamada original — a tela não pode ter dois caminhos de resposta
  const repetido = await movimentoJaGravado(dados.chaveIdempotencia)
  if (repetido) return { movimento: repetido, loteCriado: null }

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
    throw conflito(
      `Só há ${plural(disponivel, 'peça')} em ${origem.etapa.nome}. Registre a perda antes, se for o caso.`,
    )
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
        chaveIdempotencia: dados.chaveIdempotencia ?? null,
      },
    })

    return { movimento, loteCriado }
  })

  await atualizarConclusao(lote.id)
  if (resultado.loteCriado) await atualizarConclusao(resultado.loteCriado.id)
  return resultado
}

/*
 * MOTIVO TIPADO: obrigatório na tela, opcional aqui — e isso não é incoerência.
 *
 * A fila offline guarda o corpo da requisição no celular e reenvia dias depois.
 * Uma perda registrada no ateliê sem sinal ANTES desta lista existir sobe sem o
 * campo, e recusá-la apagaria o registro de peça que quebrou de verdade —
 * exatamente o que a fila existe para impedir. Perda sem diagnóstico ainda é
 * uma perda; perda que sumiu é um erro de saldo.
 *
 * O que não passa nunca é valor INVENTADO. Motivo fora da lista entraria no
 * ranking como um balde só dele, e a soma que justifica a lista fixa se
 * desfaria em silêncio.
 */
function motivoTipadoDaPerda(valor: string | null | undefined): string | null {
  const limpo = (valor ?? '').trim()
  if (!limpo) return null
  if (!ehMotivoDePerda(limpo)) throw invalido(mensagemDeMotivoInvalido(limpo))
  return limpo
}

export async function registrarPerda(
  dados: {
    loteId: string
    etapaId: string
    quantidade: number
    motivo: string
    /** um dos valores de lib/motivos-perda.ts */
    motivoTipo?: string | null
    chaveIdempotencia?: string | null
  },
  sessao: Sessao,
) {
  const repetido = await movimentoJaGravado(dados.chaveIdempotencia)
  if (repetido) return repetido

  const motivoTipo = motivoTipadoDaPerda(dados.motivoTipo)

  const lote = await prisma.lote.findUnique({ where: { id: dados.loteId } })
  if (!lote) throw naoEncontrado('Lote')

  const disponivel = await saldoNaEtapa(dados.loteId, dados.etapaId)
  if (dados.quantidade > disponivel) {
    throw conflito(`Só há ${plural(disponivel, 'peça')} nesta etapa.`)
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
      motivoTipo,
      usuarioId: sessao.id,
      usuarioNome: sessao.nome,
      chaveIdempotencia: dados.chaveIdempotencia ?? null,
    },
  })
  await atualizarConclusao(dados.loteId)
  return movimento
}

/*
 * SEGUNDA QUALIDADE.
 *
 * Peça com defeito pequeno que não é refugo: vende com desconto, em feira ou
 * como segunda linha. Antes o lote só tinha dois destinos — avançar ou perder —
 * e jogar isto na perda fazia três estragos de uma vez: sumia com estoque que
 * existe, inflava a taxa de perda, e por ela contaminava o custo de todas as
 * outras peças (lib/precificacao.ts prefere a perda medida).
 *
 * Vai para uma etapa terminal do tipo `segunda`, então continua contando como
 * saldo — é estoque, não sumiço.
 */
export async function registrarSegunda(
  dados: {
    loteId: string
    etapaId: string
    quantidade: number
    motivo: string
    chaveIdempotencia?: string | null
  },
  sessao: Sessao,
) {
  const repetido = await movimentoJaGravado(dados.chaveIdempotencia)
  if (repetido) return repetido

  const lote = await prisma.lote.findUnique({ where: { id: dados.loteId } })
  if (!lote) throw naoEncontrado('Lote')

  const destino = await prisma.etapa.findFirst({ where: { tipo: 'segunda', ativo: true } })
  if (!destino) {
    throw invalido(
      'Não há etapa de segunda qualidade cadastrada. Crie uma etapa do tipo "segunda" em Etapas.',
    )
  }

  const disponivel = await saldoNaEtapa(dados.loteId, dados.etapaId)
  if (dados.quantidade > disponivel) {
    throw conflito(`Só há ${plural(disponivel, 'peça')} nesta etapa.`)
  }

  const movimento = await prisma.movimentoLote.create({
    data: {
      loteId: dados.loteId,
      etapaOrigemId: dados.etapaId,
      etapaDestinoId: destino.id,
      quantidade: dados.quantidade,
      tipo: 'segunda',
      corId: lote.corId,
      motivo: dados.motivo,
      usuarioId: sessao.id,
      usuarioNome: sessao.nome,
      chaveIdempotencia: dados.chaveIdempotencia ?? null,
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

/*
 * ─────────────────────────── EXCLUIR ───────────────────────────
 *
 * Apagar de verdade, e não cancelar. Cancelar joga o saldo restante como
 * PERDA, e a perda medida da peça alimenta em silêncio a quantidade que o
 * planejamento manda produzir e o custo real na precificação — limpar lote de
 * teste não pode encarecer o produto. A regra do que pode e do que some junto
 * mora em lib/exclusao-lote.ts, sem Prisma, para poder ser testada.
 *
 * A exclusão em si não some do sistema: todo DELETE cai no log de atividade
 * (quem, quando, qual lote) pelo middleware de auditoria.
 */

/** Retrato do lote para a confirmação — não apaga nada. */
export async function previaDaExclusao(id: string) {
  const lote = await prisma.lote.findUnique({
    where: { id },
    include: {
      peca: { select: { nome: true } },
      cor: { select: { nome: true, hex: true } },
      divisoes: { select: { codigo: true }, orderBy: { codigo: 'asc' } },
      queimas: { select: { queima: { select: { codigo: true, status: true } } } },
      encomenda: { select: { id: true, codigo: true, status: true } },
      _count: { select: { movimentos: true } },
    },
  })
  if (!lote) throw naoEncontrado('Lote')

  const outrosLotes = lote.encomendaId
    ? await prisma.lote.count({ where: { encomendaId: lote.encomendaId, id: { not: id } } })
    : 0

  const saldos = (await saldosPorLote([id])).get(id) ?? new Map<string, number>()
  const avaliacao = avaliarExclusao({
    codigo: lote.codigo,
    movimentos: lote._count.movimentos,
    divisoes: lote.divisoes,
    fornadas: lote.queimas.map((q: { queima: { codigo: string; status: string } }) => q.queima),
    encomenda: lote.encomenda ? { codigo: lote.encomenda.codigo, outrosLotes } : null,
  })

  return {
    id: lote.id,
    codigo: lote.codigo,
    peca: lote.peca.nome,
    cor: lote.cor,
    quantidadeInicial: lote.quantidadeInicial,
    saldo: [...saldos.values()].reduce((s, q) => s + q, 0),
    movimentos: lote._count.movimentos,
    ...avaliacao,
  }
}

export async function excluirLote(id: string) {
  const previa = await previaDaExclusao(id)
  if (!previa.pode) throw conflito(previa.impedimento ?? 'Este lote não pode ser apagado.')

  const lote = await prisma.lote.findUnique({
    where: { id },
    select: { encomendaId: true, encomenda: { select: { status: true } } },
  })
  if (!lote) throw naoEncontrado('Lote')

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // movimentos e itens de fornada saem por cascade (onDelete: Cascade)
    await tx.lote.delete({ where: { id } })

    // a encomenda só virou "em produção" porque este lote existia
    if (previa.soltarEncomenda && lote.encomendaId && lote.encomenda?.status === 'em_producao') {
      await tx.encomenda.update({ where: { id: lote.encomendaId }, data: { status: 'aberta' } })
    }
  })

  return { ok: true, codigo: previa.codigo, movimentosApagados: previa.movimentos }
}
