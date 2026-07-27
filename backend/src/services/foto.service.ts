import { prisma } from '../lib/prisma'
import { naoEncontrado, regraDeNegocio } from '../lib/erros'
import { calcularEstoque } from './estoque.service'

/*
 * A FILA DE FOTOGRAFIA — a etapa de produção que ninguém tinha visto.
 *
 * Peça pronta sem foto não é peça vendável. O quadro mostrava tudo verde em
 * "Pronto" enquanto a peça não estava anunciada em lugar nenhum. Com a Gabi na
 * Espanha isso deixa de ser "ela faz depois" e vira uma fila com fuso horário
 * no meio — o tipo de coisa que acumula sem ninguém perceber.
 *
 * Granularidade: peça+cor, não lote. Um Bowl Pistache fotografado uma vez serve
 * toda fornada futura; o que precisa de foto é combinação NOVA.
 */

export const CICLO = ['pendente', 'fotografado', 'enviado', 'editado', 'publicado'] as const
export type EtapaDaFoto = (typeof CICLO)[number]

const ROTULO: Record<EtapaDaFoto, string> = {
  pendente: 'a fotografar',
  fotografado: 'fotografado, a enviar',
  enviado: 'com a Gabi',
  editado: 'editado, a publicar',
  publicado: 'na loja',
}

/**
 * A fila inteira, com o estoque parado atrás de cada combinação.
 *
 * A ordem não é o ciclo: é o PREJUÍZO. Combinação com peça pronta e sem foto
 * está com dinheiro parado na prateleira; combinação sem peça nenhuma pode
 * esperar. Ordenar pelo status esconderia isso.
 */
export async function filaDeFotos() {
  const [combinacoes, estoque] = await Promise.all([
    prisma.pecaCor.findMany({
      where: { ativo: true },
      include: {
        peca: { select: { id: true, nome: true, ativo: true } },
        cor: { select: { id: true, nome: true, hex: true, malhado: true, amostraUrl: true } },
      },
    }),
    calcularEstoque(),
  ])

  type Combinacao = {
    id: string
    pecaId: string
    corId: string
    fotoStatus: string
    fotoUrl: string | null
    fotoObservacao: string | null
    fotoAtualizadaEm: Date | null
    peca: { id: string; nome: string; ativo: boolean }
    cor: { id: string; nome: string; hex: string; malhado: boolean; amostraUrl: string | null }
  }

  const linhas = (combinacoes as Combinacao[])
    .filter((c) => c.peca.ativo)
    .map((c) => {
      const prontas = estoque.prontosPorCor.get(`${c.pecaId}:${c.corId}`) ?? 0
      const aCaminho = estoque.emProducaoPorCor.get(`${c.pecaId}:${c.corId}`) ?? 0
      return {
        id: c.id,
        pecaId: c.pecaId,
        peca: c.peca.nome,
        corId: c.corId,
        cor: c.cor.nome,
        corHex: c.cor.hex,
        malhado: c.cor.malhado,
        amostraUrl: c.cor.amostraUrl,
        status: c.fotoStatus as EtapaDaFoto,
        rotulo: ROTULO[c.fotoStatus as EtapaDaFoto] ?? c.fotoStatus,
        fotoUrl: c.fotoUrl,
        observacao: c.fotoObservacao,
        atualizadaEm: c.fotoAtualizadaEm,
        prontas,
        aCaminho,
        /** peça existe e não pode ser vendida — é o que dói */
        travando: prontas > 0 && c.fotoStatus !== 'publicado',
        nuncaFotografada: c.fotoStatus === 'pendente',
      }
    })

  linhas.sort((a, b) => {
    if (a.travando !== b.travando) return a.travando ? -1 : 1
    if (b.prontas !== a.prontas) return b.prontas - a.prontas
    return a.peca.localeCompare(b.peca, 'pt-BR')
  })

  const resumo = {
    total: linhas.length,
    travando: linhas.filter((l) => l.travando).length,
    pecasTravadas: linhas.filter((l) => l.travando).reduce((n, l) => n + l.prontas, 0),
    ...Object.fromEntries(CICLO.map((e) => [e, linhas.filter((l) => l.status === e).length])),
  }

  return { linhas, resumo }
}

export async function atualizarFoto(
  pecaCorId: string,
  dados: { status?: string; fotoUrl?: string | null; observacao?: string | null },
) {
  const existente = await prisma.pecaCor.findUnique({ where: { id: pecaCorId } })
  if (!existente) throw naoEncontrado('Combinação peça e cor')

  if (dados.status && !CICLO.includes(dados.status as EtapaDaFoto)) {
    throw regraDeNegocio(`Etapa de foto inválida: ${dados.status}. Use uma de ${CICLO.join(', ')}.`)
  }

  return prisma.pecaCor.update({
    where: { id: pecaCorId },
    data: {
      ...(dados.status ? { fotoStatus: dados.status, fotoAtualizadaEm: new Date() } : {}),
      ...(dados.fotoUrl !== undefined ? { fotoUrl: dados.fotoUrl } : {}),
      ...(dados.observacao !== undefined ? { fotoObservacao: dados.observacao } : {}),
    },
  })
}

/** Avança uma casa no ciclo. É o botão que a Gabi mais vai usar. */
export async function avancarFoto(pecaCorId: string) {
  const existente = await prisma.pecaCor.findUnique({ where: { id: pecaCorId } })
  if (!existente) throw naoEncontrado('Combinação peça e cor')
  const i = CICLO.indexOf(existente.fotoStatus as EtapaDaFoto)
  if (i < 0 || i === CICLO.length - 1) {
    throw regraDeNegocio('Esta combinação já está publicada na loja.')
  }
  return prisma.pecaCor.update({
    where: { id: pecaCorId },
    data: { fotoStatus: CICLO[i + 1], fotoAtualizadaEm: new Date() },
  })
}
