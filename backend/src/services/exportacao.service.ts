import { prisma } from '../lib/prisma'
import { invalido } from '../lib/erros'
import { instanteBr, paraCsv } from '../lib/exportacao'

const TIPOS: Record<string, string> = {
  entrada: 'entrada', avanco: 'avanço', retorno: 'retorno', perda: 'perda', segunda: 'segunda qualidade',
  divisao_saida: 'saiu por divisão', divisao_entrada: 'entrou por divisão', saida: 'saída do estoque', devolucao: 'voltou ao estoque',
}

/** todos os movimentos do livro-razão no período, um por linha */
export async function exportarMovimentos(de: string, ate: string) {
  const ok = /^\d{4}-\d{2}-\d{2}$/
  if (!ok.test(de) || !ok.test(ate)) throw invalido('Informe o período no formato AAAA-MM-DD.')
  // dias do ateliê (UTC-3): o "até" inclui o dia inteiro
  const inicio = new Date(`${de}T03:00:00Z`)
  const fim = new Date(new Date(`${ate}T03:00:00Z`).getTime() + 24 * 60 * 60 * 1000)
  if (fim <= inicio) throw invalido('O fim do período vem antes do começo.')

  const movimentos = (await prisma.movimentoLote.findMany({
    where: { criadoEm: { gte: inicio, lt: fim } },
    orderBy: { criadoEm: 'asc' },
    select: {
      criadoEm: true, tipo: true, quantidade: true, motivo: true, motivoTipo: true, usuarioNome: true,
      lote: { select: { codigo: true, peca: { select: { nome: true } } } },
      cor: { select: { nome: true } },
      etapaOrigem: { select: { nome: true } },
      etapaDestino: { select: { nome: true } },
    },
  })) as {
    criadoEm: Date; tipo: string; quantidade: number; motivo: string | null; motivoTipo: string | null; usuarioNome: string | null
    lote: { codigo: string; peca: { nome: string } }; cor: { nome: string } | null
    etapaOrigem: { nome: string } | null; etapaDestino: { nome: string } | null
  }[]

  const csv = paraCsv(
    [
      { chave: 'quando', rotulo: 'Data e hora' }, { chave: 'lote', rotulo: 'Lote' }, { chave: 'peca', rotulo: 'Peça' },
      { chave: 'cor', rotulo: 'Esmalte' }, { chave: 'tipo', rotulo: 'Movimento' }, { chave: 'de', rotulo: 'De' },
      { chave: 'para', rotulo: 'Para' }, { chave: 'qtd', rotulo: 'Quantidade' }, { chave: 'motivo', rotulo: 'Motivo' },
      { chave: 'quem', rotulo: 'Quem registrou' },
    ],
    movimentos.map((m) => ({
      quando: instanteBr(m.criadoEm), lote: m.lote.codigo, peca: m.lote.peca.nome, cor: m.cor?.nome ?? '',
      tipo: TIPOS[m.tipo] ?? m.tipo, de: m.etapaOrigem?.nome ?? '', para: m.etapaDestino?.nome ?? '',
      qtd: m.quantidade, motivo: m.motivo ?? m.motivoTipo ?? '', quem: m.usuarioNome ?? '',
    })),
  )
  return { csv, nome: `movimentos-${de}-a-${ate}.csv`, linhas: movimentos.length }
}
