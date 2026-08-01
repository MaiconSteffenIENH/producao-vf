import bcrypt from 'bcryptjs'
import type { z } from 'zod'
import { prisma } from '../lib/prisma'
import { conflito, invalido, naoEncontrado } from '../lib/erros'
import { CHAVES_DE_MODULO, listaDoPapel } from '../lib/modulos'
import type { usuarioSchema } from '../schemas'

const SEM_SENHA = {
  id: true,
  nome: true,
  email: true,
  ativo: true,
  precisaTrocarSenha: true,
  criadoEm: true,
  papel: { select: { id: true, nome: true, admin: true } },
} as const

export const listarUsuarios = () => prisma.usuario.findMany({ orderBy: { nome: 'asc' }, select: SEM_SENHA })

export type PapelComModulos = {
  id: string
  nome: string
  admin: boolean
  protegido: boolean
  permissoes: unknown
  criadoEm: Date
  /** `null` = este papel não restringe nada, e por isso enxerga tudo. */
  modulos: string[] | null
}

/** O papel como ele sai do banco, antes da lista de módulos ser traduzida. */
type PapelDoBanco = Omit<PapelComModulos, 'modulos'>

/**
 * Os papéis, com a lista de módulos já traduzida de dentro do `permissoes`.
 *
 * A tradução acontece aqui e não na tela porque `null` (não restringe) e `[]`
 * (restringe a nada) são estados diferentes com aparência igual em JSON — quem
 * decide qual é qual é `listaDoPapel`, a mesma função que o guarda das rotas
 * usa. Deixar a tela reinterpretar o JSON seria abrir a porta para o menu e a
 * API discordarem sobre o que a pessoa pode ver.
 */
export async function listarPapeis(): Promise<PapelComModulos[]> {
  const papeis = await prisma.papel.findMany({ orderBy: { nome: 'asc' } })
  return papeis.map((p: PapelDoBanco) => {
    const lista = listaDoPapel(p.permissoes)
    return { ...p, modulos: lista ? [...lista] : null }
  })
}

/**
 * Quais módulos este papel libera. `modulos: null` devolve o papel ao estado de
 * hoje — sem restrição nenhuma.
 *
 * Chave que não existe mais no registro é descartada na gravação. É o outro
 * lado do "remover um deve ser refletido não aparecer mais": módulo aposentado
 * não deixa lixo marcado no papel, esperando para voltar à vida se algum dia
 * alguém reaproveitar a mesma chave para outra coisa.
 */
export async function definirModulosDoPapel(papelId: string, corpo: unknown): Promise<PapelComModulos> {
  const papel = await prisma.papel.findUnique({ where: { id: papelId } })
  if (!papel) throw naoEncontrado('Papel')

  /*
   * Campo AUSENTE não é o mesmo que `null`.
   *
   * `null` é a pessoa dizendo "este papel volta a ver tudo". Ausente é corpo
   * malformado — cliente velho, JSON truncado, digitação errada no curl. Num
   * endpoint que CONCEDE permissão, tratar os dois igual faz o acidente cair
   * sempre no lado mais permissivo, e ninguém percebe: a tela recarrega
   * mostrando "vê tudo" e parece que deu certo.
   */
  const temCampo =
    typeof corpo === 'object' && corpo !== null && Object.hasOwn(corpo as object, 'modulos')
  if (!temCampo) {
    throw invalido('Envie "modulos" com a lista do papel, ou nulo para ele voltar a ver tudo.')
  }
  const bruto = (corpo as { modulos?: unknown }).modulos
  if (bruto !== null && !Array.isArray(bruto)) {
    throw invalido('Envie a lista de módulos do papel, ou nulo para ele voltar a ver tudo.')
  }

  const permissoes: Record<string, unknown> =
    typeof papel.permissoes === 'object' && papel.permissoes !== null && !Array.isArray(papel.permissoes)
      ? { ...papel.permissoes }
      : {}

  // o resto do `permissoes` é preservado: ele guarda outras chaves do papel, e
  // salvar só os módulos apagaria configuração que esta tela nem mostra
  if (bruto === null) {
    delete permissoes.modulos
  } else {
    permissoes.modulos = bruto.filter(
      (c: unknown): c is string => typeof c === 'string' && CHAVES_DE_MODULO.includes(c),
    )
  }

  const salvo = await prisma.papel.update({ where: { id: papelId }, data: { permissoes } })
  const lista = listaDoPapel(salvo.permissoes)
  return { ...salvo, modulos: lista ? [...lista] : null }
}

/**
 * As permissões do papel de quem está chamando, lidas do banco a cada uso.
 *
 * Pelo id do usuário, e não pelo nome do papel que veio no token: o token é
 * assinado no login e continua valendo por dias. Tirar um módulo de um papel
 * só teria efeito depois que a pessoa saísse e entrasse de novo — o oposto de
 * "remover um deve ser refletido não aparecer mais". Ler do banco custa uma
 * consulta pequena e faz a mudança valer na requisição seguinte.
 *
 * Usuário sem papel devolve `{}`, que é "não restringe" — o mesmo que o /me
 * responde, para o menu e a API nunca discordarem.
 */
export async function permissoesDoUsuario(usuarioId: string): Promise<unknown> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { papel: { select: { permissoes: true } } },
  })
  return usuario?.papel?.permissoes ?? {}
}

export async function criarUsuario(dados: z.infer<typeof usuarioSchema>) {
  const senha = dados.senha && dados.senha.length >= 8 ? dados.senha : senhaProvisoria()
  const usuario = await prisma.usuario.create({
    data: {
      nome: dados.nome,
      email: dados.email.toLowerCase(),
      papelId: dados.papelId,
      ativo: dados.ativo,
      senhaHash: await bcrypt.hash(senha, 10),
      precisaTrocarSenha: true,
    },
    select: SEM_SENHA,
  })
  // a senha provisória volta UMA vez, para quem cadastrou repassar
  return { ...usuario, senhaProvisoria: senha }
}

export async function atualizarUsuario(id: string, dados: z.infer<typeof usuarioSchema>) {
  return prisma.usuario.update({
    where: { id },
    data: {
      nome: dados.nome,
      email: dados.email.toLowerCase(),
      papelId: dados.papelId,
      ativo: dados.ativo,
    },
    select: SEM_SENHA,
  })
}

export async function redefinirSenha(id: string) {
  const senha = senhaProvisoria()
  await prisma.usuario.update({
    where: { id },
    data: { senhaHash: await bcrypt.hash(senha, 10), precisaTrocarSenha: true },
  })
  return { senhaProvisoria: senha }
}

export async function excluirUsuario(id: string, idDeQuemPediu: string) {
  if (id === idDeQuemPediu) throw invalido('Você não pode excluir o próprio usuário.')
  const admins = await prisma.usuario.count({ where: { ativo: true, papel: { admin: true } } })
  const alvo = await prisma.usuario.findUnique({ where: { id }, include: { papel: true } })
  if (alvo?.papel?.admin && admins <= 1) {
    throw conflito('Este é o último administrador ativo. Promova outra pessoa antes.')
  }
  await prisma.usuario.delete({ where: { id } })
}

/** Legível em voz alta pelo WhatsApp: sem 0/O nem 1/l. */
function senhaProvisoria(): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 10; i++) s += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  return s
}
