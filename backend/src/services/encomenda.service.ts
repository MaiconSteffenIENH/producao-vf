import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { naoEncontrado } from '../lib/erros'
import { proximoCodigo } from './contador.service'
import { cabeNoPrazo, faixaEmTexto, preverConclusao, type EtapaDoRoteiro } from '../lib/previsao'

/*
 * ENCOMENDA COM PRAZO.
 *
 * Não estava no briefing. Um jogo sob medida tem data e cliente, e disputa o
 * MESMO forno com a produção de estoque. Sem estar no sistema, encomenda vira
 * post-it que fura a fila sem ninguém saber por quê — e o planejamento fica
 * dizendo para produzir outra coisa.
 */

/** o que o Prisma devolve nas telas de encomenda; explícito porque o client
 *  não é gerado no ambiente onde este código foi escrito */
type EncomendaCrua = {
  id: string
  entregarAte: Date | null
  itens: { pecaId: string }[]
}

const incluir = {
  itens: {
    include: {
      peca: { select: { id: true, nome: true } },
      cor: { select: { id: true, nome: true, hex: true } },
    },
  },
  lotes: { select: { id: true, codigo: true, concluidoEm: true, canceladoEm: true } },
}

export async function listarEncomendas(filtros: { status?: string } = {}) {
  const encomendas = await prisma.encomenda.findMany({
    where: filtros.status ? { status: filtros.status } : {},
    include: incluir,
    orderBy: [{ entregarAte: 'asc' }, { criadoEm: 'desc' }],
  })
  return Promise.all((encomendas as EncomendaCrua[]).map((e) => comPrazo(e)))
}

export async function obterEncomenda(id: string) {
  const encomenda = await prisma.encomenda.findUnique({ where: { id }, include: incluir })
  if (!encomenda) throw naoEncontrado('Encomenda')
  return comPrazo(encomenda)
}

/**
 * Anexa a leitura de prazo: dá para entregar no dia pedido?
 *
 * A conta usa o TETO da faixa de previsão, não o piso. Prometer pelo melhor
 * caso é exatamente como se perde cliente de encomenda.
 */
async function comPrazo<T extends { entregarAte: Date | null; itens: { pecaId: string }[] }>(
  encomenda: T,
  agora = new Date(),
) {
  if (!encomenda.entregarAte || encomenda.itens.length === 0) {
    return { ...encomenda, prazo: null }
  }

  type RoteiroCru = {
    pecaId: string
    ordem: number
    diasEstimados: number
    etapa: { id: string; nome: string; aguardaCarga: boolean; estoqueIntermediario: boolean }
  }
  const roteiros: RoteiroCru[] = await prisma.roteiroEtapa.findMany({
    where: { pecaId: { in: encomenda.itens.map((i) => i.pecaId) } },
    include: {
      etapa: { select: { id: true, nome: true, aguardaCarga: true, estoqueIntermediario: true } },
    },
  })

  // o prazo da encomenda é o da peça MAIS DEMORADA — o jogo só fica pronto
  // quando a última peça dele fica
  let pior = { diasMaximo: -1, texto: '', cabe: true }
  for (const pecaId of new Set(encomenda.itens.map((i) => i.pecaId))) {
    const roteiro: EtapaDoRoteiro[] = roteiros
      .filter((r) => r.pecaId === pecaId)
      .map((r) => ({
        etapaId: r.etapa.id,
        nome: r.etapa.nome,
        ordem: r.ordem,
        diasEstimados: r.diasEstimados,
        aguardaCarga: r.etapa.aguardaCarga,
        estoqueIntermediario: r.etapa.estoqueIntermediario,
      }))
    const previsao = preverConclusao(roteiro, 0)
    if (previsao.diasMaximo > pior.diasMaximo) {
      pior = {
        diasMaximo: previsao.diasMaximo,
        texto: faixaEmTexto(previsao),
        cabe: cabeNoPrazo(previsao, agora, encomenda.entregarAte),
      }
    }
  }

  const diasAteEntrega = Math.ceil(
    (encomenda.entregarAte.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000),
  )
  return {
    ...encomenda,
    prazo: {
      diasAteEntrega,
      previsao: pior.texto,
      cabe: pior.cabe,
      aviso: pior.cabe
        ? null
        : `Pela previsão, esta encomenda leva ${pior.texto} e faltam ${diasAteEntrega} dias. Combine outra data ou priorize agora.`,
    },
  }
}

export async function criarEncomenda(dados: {
  cliente: string
  contato?: string | null
  entregarAte?: string | null
  observacao?: string | null
  itens: { pecaId: string; corId?: string | null; quantidade: number }[]
}) {
  const codigo = await proximoCodigo('encomenda', 'E')
  const criada = await prisma.encomenda.create({
    data: {
      codigo,
      cliente: dados.cliente,
      contato: dados.contato ?? null,
      entregarAte: dados.entregarAte ? new Date(dados.entregarAte) : null,
      observacao: dados.observacao ?? null,
      itens: {
        create: dados.itens.map((i) => ({
          pecaId: i.pecaId,
          corId: i.corId ?? null,
          quantidade: i.quantidade,
        })),
      },
    },
    include: incluir,
  })
  return comPrazo(criada)
}

export async function atualizarEncomenda(
  id: string,
  dados: {
    cliente?: string
    contato?: string | null
    status?: string
    entregarAte?: string | null
    observacao?: string | null
    itens?: { pecaId: string; corId?: string | null; quantidade: number }[]
  },
) {
  const existente = await prisma.encomenda.findUnique({ where: { id } })
  if (!existente) throw naoEncontrado('Encomenda')

  const atualizada = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (dados.itens) {
      // troca a lista inteira: editar item a item exigiria id no payload e a
      // tela é um formulário simples, não uma grade
      await tx.encomendaItem.deleteMany({ where: { encomendaId: id } })
      await tx.encomendaItem.createMany({
        data: dados.itens.map((i) => ({
          encomendaId: id,
          pecaId: i.pecaId,
          corId: i.corId ?? null,
          quantidade: i.quantidade,
        })),
      })
    }
    return tx.encomenda.update({
      where: { id },
      data: {
        ...(dados.cliente !== undefined ? { cliente: dados.cliente } : {}),
        ...(dados.contato !== undefined ? { contato: dados.contato } : {}),
        ...(dados.status !== undefined ? { status: dados.status } : {}),
        ...(dados.observacao !== undefined ? { observacao: dados.observacao } : {}),
        ...(dados.entregarAte !== undefined
          ? { entregarAte: dados.entregarAte ? new Date(dados.entregarAte) : null }
          : {}),
        ...(dados.status === 'entregue' ? { entregueEm: new Date() } : {}),
      },
      include: incluir,
    })
  })
  return comPrazo(atualizada)
}

export async function apagarEncomenda(id: string) {
  await prisma.encomenda.delete({ where: { id } })
}
