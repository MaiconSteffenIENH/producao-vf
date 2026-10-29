import { prisma } from '../lib/prisma'
import { normalizarBusca } from '../lib/busca'
import { conflito, invalido } from '../lib/erros'
import { cadastroDoCartao, lerCartaoCnpj, pareceCartaoCnpj } from '../lib/cartao-cnpj'
import type { z } from 'zod'
import type { parceiroSchema } from '../schemas'

/*
 * CLIENTE E FORNECEDOR: o mesmo formulário, duas tabelas.
 *
 * As tabelas são separadas porque a vida é separada (cliente tem encomenda,
 * fornecedor tem matéria-prima), mas os campos são os mesmos e o cartão CNPJ
 * preenche os dois do mesmo jeito. Um service só, parametrizado pelo tipo,
 * evita que as duas telas divirjam na primeira correção.
 */
export type TipoParceiro = 'clientes' | 'fornecedores'
type Dados = z.infer<typeof parceiroSchema>

const tabela = (tipo: TipoParceiro) =>
  (tipo === 'clientes' ? prisma.cliente : prisma.fornecedor) as unknown as {
    findMany: (a: unknown) => Promise<unknown[]>
    findFirst: (a: unknown) => Promise<{ id: string; nome: string } | null>
    create: (a: unknown) => Promise<unknown>
    update: (a: unknown) => Promise<unknown>
    delete: (a: unknown) => Promise<unknown>
  }

const soDigitos = (v: string | null | undefined) => (v ? v.replace(/\D/g, '') || null : null)
const vazio = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)

function paraBanco(d: Dados) {
  const documento = vazio(d.documento)
  const limpo = soDigitos(documento)
  return {
    nome: d.nome,
    nomeBusca: normalizarBusca(d.nome),
    documento,
    documentoLimpo: limpo,
    // 11 dígitos é CPF; o resto (14, ou nada) é tratado como empresa
    tipo: limpo && limpo.length === 11 ? 'pf' : 'pj',
    email: vazio(d.email),
    telefone: vazio(d.telefone),
    endereco: vazio(d.endereco),
    bairro: vazio(d.bairro),
    cidade: vazio(d.cidade),
    uf: vazio(d.uf)?.toUpperCase().slice(0, 2) ?? null,
    cep: vazio(d.cep),
    atividade: vazio(d.atividade),
    porte: vazio(d.porte),
    situacaoCadastral: vazio(d.situacao),
    dataAbertura: d.dataAbertura ? new Date(`${d.dataAbertura}T00:00:00Z`) : null,
    observacao: vazio(d.observacao),
    ativo: d.ativo ?? true,
  }
}

async function recusarDocumentoRepetido(tipo: TipoParceiro, documentoLimpo: string | null, menosId?: string) {
  if (!documentoLimpo) return
  const outro = await tabela(tipo).findFirst({
    where: { documentoLimpo, ...(menosId ? { id: { not: menosId } } : {}) },
    select: { id: true, nome: true },
  })
  if (outro) throw conflito(`Este documento já está cadastrado em ${outro.nome}.`)
}

export async function listar(tipo: TipoParceiro, busca?: string) {
  const termo = busca ? normalizarBusca(busca) : ''
  const comUso = tipo === 'clientes' ? { _count: { select: { encomendas: true } } } : { _count: { select: { materias: true } } }
  return tabela(tipo).findMany({
    where: termo
      ? { OR: [{ nomeBusca: { contains: termo } }, { documentoLimpo: { contains: termo.replace(/\D/g, '') || '§' } }] }
      : undefined,
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    include: comUso,
  })
}

export async function criar(tipo: TipoParceiro, d: Dados) {
  const dados = paraBanco(d)
  await recusarDocumentoRepetido(tipo, dados.documentoLimpo)
  return tabela(tipo).create({ data: dados })
}

export async function atualizar(tipo: TipoParceiro, id: string, d: Dados) {
  const dados = paraBanco(d)
  await recusarDocumentoRepetido(tipo, dados.documentoLimpo, id)
  return tabela(tipo).update({ where: { id }, data: dados })
}

/** quem tem histórico só inativa: apagar soltaria encomendas e matérias do cadastro */
export async function excluir(tipo: TipoParceiro, id: string) {
  const usos =
    tipo === 'clientes'
      ? await prisma.encomenda.count({ where: { clienteId: id } })
      : await prisma.materiaPrima.count({ where: { fornecedorId: id } })
  if (usos > 0) {
    throw conflito(
      `Tem ${usos} ${tipo === 'clientes' ? 'encomenda(s)' : 'matéria(s)-prima(s)'} ligada(s). Desative em vez de apagar: o histórico continua apontando para cá.`,
    )
  }
  await tabela(tipo).delete({ where: { id } })
  return { ok: true }
}

/** cola o texto do cartão CNPJ da Receita e devolve o formulário preenchido, sem gravar */
export function lerCartao(texto: string) {
  if (!pareceCartaoCnpj(texto)) {
    throw invalido('Isto não é um cartão CNPJ. Abra o PDF da Receita, selecione tudo e cole aqui.')
  }
  return { cadastro: cadastroDoCartao(lerCartaoCnpj(texto)) }
}

/**
 * Encomenda nova com o nome de um cliente já cadastrado fica ligada a ele.
 * A tela continua aceitando texto livre (cliente de uma vez só não precisa de
 * cadastro), e o vínculo acontece sozinho quando o nome bate.
 */
export async function clientePeloNome(nome: string): Promise<string | null> {
  const achado = await prisma.cliente.findFirst({
    where: { nomeBusca: normalizarBusca(nome), ativo: true },
    select: { id: true },
  })
  return achado?.id ?? null
}
