import { prisma } from '../lib/prisma'
import { normalizarBusca } from '../lib/busca'
import { conflito } from '../lib/erros'
import type { z } from 'zod'
import type {
  categoriaSchema,
  corSchema,
  etapaSchema,
  materiaPrimaSchema,
  responsavelSchema,
} from '../schemas'

const vazioParaNulo = (v: string | null | undefined) => (v ? v : null)

// ─────────────────────────── Categorias ───────────────────────────

export const listarCategorias = () => prisma.categoria.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] })

export const criarCategoria = (dados: z.infer<typeof categoriaSchema>) => prisma.categoria.create({ data: dados })

export const atualizarCategoria = (id: string, dados: z.infer<typeof categoriaSchema>) =>
  prisma.categoria.update({ where: { id }, data: dados })

export async function excluirCategoria(id: string) {
  const emUso = await prisma.peca.count({ where: { categoriaId: id } })
  if (emUso > 0) throw conflito(`Esta categoria está em ${emUso} peça(s). Mude as peças de categoria antes.`)
  await prisma.categoria.delete({ where: { id } })
}

// ─────────────────────────── Esmaltes (cores) ───────────────────────────

export const listarCores = () => prisma.cor.findMany({ orderBy: { nome: 'asc' } })

export const criarCor = (dados: z.infer<typeof corSchema>) =>
  prisma.cor.create({
    data: {
      ...dados,
      amostraUrl: vazioParaNulo(dados.amostraUrl),
      observacao: vazioParaNulo(dados.observacao),
      nomeBusca: normalizarBusca(dados.nome),
    },
  })

export const atualizarCor = (id: string, dados: z.infer<typeof corSchema>) =>
  prisma.cor.update({
    where: { id },
    data: {
      ...dados,
      amostraUrl: vazioParaNulo(dados.amostraUrl),
      observacao: vazioParaNulo(dados.observacao),
      nomeBusca: normalizarBusca(dados.nome),
    },
  })

export async function excluirCor(id: string) {
  const emUso = await prisma.pecaCor.count({ where: { corId: id } })
  if (emUso > 0) {
    throw conflito(
      `Este esmalte está em ${emUso} peça(s). Desative-o em vez de excluir — o histórico dos lotes precisa dele.`,
    )
  }
  await prisma.cor.delete({ where: { id } })
}

// ─────────────────────────── Responsáveis ───────────────────────────

export const listarResponsaveis = () =>
  prisma.responsavel.findMany({
    orderBy: { nome: 'asc' },
    include: { usuario: { select: { id: true, nome: true, email: true } } },
  })

export const criarResponsavel = (dados: z.infer<typeof responsavelSchema>) =>
  prisma.responsavel.create({
    data: {
      ...dados,
      capacidadeDiaria: dados.capacidadeDiaria ?? null,
      usuarioId: vazioParaNulo(dados.usuarioId),
      nomeBusca: normalizarBusca(dados.nome),
    },
  })

export const atualizarResponsavel = (id: string, dados: z.infer<typeof responsavelSchema>) =>
  prisma.responsavel.update({
    where: { id },
    data: {
      ...dados,
      capacidadeDiaria: dados.capacidadeDiaria ?? null,
      usuarioId: vazioParaNulo(dados.usuarioId),
      nomeBusca: normalizarBusca(dados.nome),
    },
  })

export async function excluirResponsavel(id: string) {
  const [emRoteiro, emEtapa, emPeca] = await Promise.all([
    prisma.roteiroEtapa.count({ where: { responsavelId: id } }),
    prisma.etapa.count({ where: { responsavelPadraoId: id } }),
    prisma.peca.count({ where: { responsavelInicialId: id } }),
  ])
  const total = emRoteiro + emEtapa + emPeca
  if (total > 0) throw conflito(`Este responsável está em ${total} lugar(es) do sistema. Desative em vez de excluir.`)
  await prisma.responsavel.delete({ where: { id } })
}

// ─────────────────────────── Etapas ───────────────────────────

export const listarEtapas = () =>
  prisma.etapa.findMany({
    orderBy: [{ ordemPadrao: 'asc' }, { nome: 'asc' }],
    include: { responsavelPadrao: { select: { id: true, nome: true, cor: true } } },
  })

export async function criarEtapa(dados: z.infer<typeof etapaSchema>) {
  await garantirUmaEtapaQueDefineCor(dados.defineCor, null)
  return prisma.etapa.create({
    data: { ...dados, responsavelPadraoId: vazioParaNulo(dados.responsavelPadraoId) },
  })
}

export async function atualizarEtapa(id: string, dados: z.infer<typeof etapaSchema>) {
  await garantirUmaEtapaQueDefineCor(dados.defineCor, id)
  return prisma.etapa.update({
    where: { id },
    data: { ...dados, responsavelPadraoId: vazioParaNulo(dados.responsavelPadraoId) },
  })
}

export async function excluirEtapa(id: string) {
  const emUso = await prisma.roteiroEtapa.count({ where: { etapaId: id } })
  if (emUso > 0) throw conflito(`Esta etapa está em ${emUso} roteiro(s) de peça. Tire dos roteiros antes.`)
  await prisma.etapa.delete({ where: { id } })
}

/**
 * Só UMA etapa pode definir a cor do lote. É nela que o biscoito deixa de ser
 * neutro e vira "20 Pistache". Duas etapas marcadas fariam o lote trocar de cor
 * no meio do caminho e o planejamento perderia o sentido.
 */
async function garantirUmaEtapaQueDefineCor(defineCor: boolean, idAtual: string | null) {
  if (!defineCor) return
  const outra = await prisma.etapa.findFirst({
    where: { defineCor: true, ...(idAtual ? { id: { not: idAtual } } : {}) },
  })
  if (outra) {
    throw conflito(`A etapa "${outra.nome}" já é a que define a cor. Desmarque ela antes de marcar outra.`)
  }
}

// ─────────────────────────── Matérias-primas ───────────────────────────

export const listarMateriasPrimas = () => prisma.materiaPrima.findMany({ orderBy: { nome: 'asc' } })

export const criarMateriaPrima = (dados: z.infer<typeof materiaPrimaSchema>) =>
  prisma.materiaPrima.create({
    data: { ...dados, fornecedor: vazioParaNulo(dados.fornecedor), nomeBusca: normalizarBusca(dados.nome) },
  })

export const atualizarMateriaPrima = (id: string, dados: z.infer<typeof materiaPrimaSchema>) =>
  prisma.materiaPrima.update({
    where: { id },
    data: { ...dados, fornecedor: vazioParaNulo(dados.fornecedor), nomeBusca: normalizarBusca(dados.nome) },
  })

export async function excluirMateriaPrima(id: string) {
  await prisma.materiaPrima.delete({ where: { id } })
}
