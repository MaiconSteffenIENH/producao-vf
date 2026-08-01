import type { Prisma } from '@prisma/client'
import type { z } from 'zod'
import { prisma } from '../lib/prisma'
import { normalizarBusca } from '../lib/busca'
import { invalido, naoEncontrado } from '../lib/erros'
import type { pecaSchema } from '../schemas'

type DadosPeca = z.infer<typeof pecaSchema>

const incluirTudo = {
  categoria: true,
  responsavelInicial: { select: { id: true, nome: true, cor: true, tipo: true } },
  roteiro: {
    orderBy: { ordem: 'asc' as const },
    include: {
      etapa: { select: { id: true, nome: true, tipo: true, defineCor: true, estoqueIntermediario: true } },
      responsavel: { select: { id: true, nome: true, cor: true } },
    },
  },
  cores: {
    include: { cor: { select: { id: true, nome: true, hex: true, malhado: true, amostraUrl: true, ativo: true } } },
  },
}

export async function listarPecas(filtros: { busca?: string; categoriaId?: string; ativo?: string }) {
  const busca = filtros.busca ? normalizarBusca(filtros.busca) : ''
  return prisma.peca.findMany({
    where: {
      ...(busca ? { nomeBusca: { contains: busca } } : {}),
      ...(filtros.categoriaId ? { categoriaId: filtros.categoriaId } : {}),
      ...(filtros.ativo === 'true' ? { ativo: true } : {}),
      ...(filtros.ativo === 'false' ? { ativo: false } : {}),
    },
    orderBy: { nome: 'asc' },
    include: incluirTudo,
  })
}

export async function obterPeca(id: string) {
  const peca = await prisma.peca.findUnique({ where: { id }, include: incluirTudo })
  if (!peca) throw naoEncontrado('Peça')
  return peca
}

/**
 * Limpa o que veio do formulário dinâmico: linha em branco vira nada, etapa
 * repetida some (a ordem é recalculada a partir da posição no array). O schema
 * zod é leniente de propósito para o service poder limpar em vez de estourar 400.
 */
function normalizarRoteiro(roteiro: DadosPeca['roteiro']) {
  const vistos = new Set<string>()
  return roteiro
    .filter((r) => r.etapaId && !vistos.has(r.etapaId) && vistos.add(r.etapaId))
    .map((r, i) => ({
      etapaId: r.etapaId,
      ordem: i + 1,
      responsavelId: r.responsavelId || null,
      diasEstimados: r.diasEstimados ?? 1,
    }))
}

function normalizarCores(cores: DadosPeca['cores']) {
  const vistos = new Set<string>()
  return cores
    .filter((c) => c.corId && !vistos.has(c.corId) && vistos.add(c.corId))
    .map((c) => ({ corId: c.corId, qtdMinimaDesejada: c.qtdMinimaDesejada ?? 0 }))
}

async function validarReferencias(roteiro: ReturnType<typeof normalizarRoteiro>, cores: ReturnType<typeof normalizarCores>) {
  if (roteiro.length > 0) {
    const existentes = await prisma.etapa.count({ where: { id: { in: roteiro.map((r) => r.etapaId) } } })
    if (existentes !== roteiro.length) throw invalido('Alguma etapa do roteiro não existe mais. Recarregue a tela.')
  }
  if (cores.length > 0) {
    const existentes = await prisma.cor.count({ where: { id: { in: cores.map((c) => c.corId) } } })
    if (existentes !== cores.length) throw invalido('Algum esmalte selecionado não existe mais. Recarregue a tela.')
  }
}

export async function criarPeca(dados: DadosPeca) {
  const roteiro = normalizarRoteiro(dados.roteiro)
  const cores = normalizarCores(dados.cores)
  await validarReferencias(roteiro, cores)

  const peca = await prisma.peca.create({
    data: {
      nome: dados.nome,
      nomeBusca: normalizarBusca(dados.nome),
      categoriaId: dados.categoriaId,
      responsavelInicialId: dados.responsavelInicialId || null,
      tempoMedioDias: dados.tempoMedioDias,
      qtdMinimaDesejada: dados.qtdMinimaDesejada,
      qtdMinimaBiscoito: dados.qtdMinimaBiscoito,
      precoBase: dados.precoBase ?? null,
      observacao: dados.observacao || null,
      ativo: dados.ativo,
      roteiro: { create: roteiro },
      cores: { create: cores },
    },
    include: incluirTudo,
  })
  return peca
}

export async function atualizarPeca(id: string, dados: DadosPeca) {
  const roteiro = normalizarRoteiro(dados.roteiro)
  const cores = normalizarCores(dados.cores)
  await validarReferencias(roteiro, cores)

  // Roteiro e cores são substituídos inteiros: é a única forma de reordenar
  // sem colidir com o @@unique([pecaId, ordem]) no meio da atualização.
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.roteiroEtapa.deleteMany({ where: { pecaId: id } })
    await tx.pecaCor.deleteMany({ where: { pecaId: id } })
    return tx.peca.update({
      where: { id },
      data: {
        nome: dados.nome,
        nomeBusca: normalizarBusca(dados.nome),
        categoriaId: dados.categoriaId,
        responsavelInicialId: dados.responsavelInicialId || null,
        tempoMedioDias: dados.tempoMedioDias,
        qtdMinimaDesejada: dados.qtdMinimaDesejada,
        qtdMinimaBiscoito: dados.qtdMinimaBiscoito,
        /*
         * NÃO É `?? null`. O cadastro de peça deixou de ter campo de preço, e
         * com ele fora do corpo `dados.precoBase` chega `undefined`. Com o
         * `?? null`, toda edição de peça — trocar o nome, mexer no roteiro —
         * APAGARIA o preço definido na tela de Preços, em silêncio. `undefined`
         * faz o Prisma não tocar na coluna, que é o comportamento certo para
         * um campo que esta tela não edita mais.
         */
        precoBase: dados.precoBase,
        observacao: dados.observacao || null,
        ativo: dados.ativo,
        roteiro: { create: roteiro },
        cores: { create: cores },
      },
      include: incluirTudo,
    })
  })
}

export async function excluirPeca(id: string) {
  // roteiro e cores caem por cascade; a FK dos lotes impede apagar peça
  // que já produziu — nesse caso o certo é desativar
  await prisma.peca.delete({ where: { id } })
}

/** Duplicar acelera o cadastro: as peças da casa compartilham quase todo o roteiro. */
export async function duplicarPeca(id: string) {
  const original = await obterPeca(id)
  let nome = `${original.nome} (cópia)`
  for (let i = 2; await prisma.peca.findUnique({ where: { nome } }); i++) {
    nome = `${original.nome} (cópia ${i})`
  }
  return prisma.peca.create({
    data: {
      nome,
      nomeBusca: normalizarBusca(nome),
      categoriaId: original.categoriaId,
      responsavelInicialId: original.responsavelInicialId,
      tempoMedioDias: original.tempoMedioDias,
      qtdMinimaDesejada: original.qtdMinimaDesejada,
      qtdMinimaBiscoito: original.qtdMinimaBiscoito,
      precoBase: original.precoBase,
      observacao: original.observacao,
      ativo: false, // nasce inativa: obriga a revisar antes de entrar no planejamento
      roteiro: {
        create: original.roteiro.map(
          (r: { etapaId: string; ordem: number; responsavelId: string | null; diasEstimados: number }) => ({
            etapaId: r.etapaId,
            ordem: r.ordem,
            responsavelId: r.responsavelId,
            diasEstimados: r.diasEstimados,
          }),
        ),
      },
      cores: {
        create: original.cores.map((c: { corId: string; qtdMinimaDesejada: number }) => ({
          corId: c.corId,
          qtdMinimaDesejada: c.qtdMinimaDesejada,
        })),
      },
    },
    include: incluirTudo,
  })
}
