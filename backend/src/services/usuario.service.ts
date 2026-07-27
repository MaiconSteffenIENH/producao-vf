import bcrypt from 'bcryptjs'
import type { z } from 'zod'
import { prisma } from '../lib/prisma'
import { conflito, invalido } from '../lib/erros'
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

export const listarPapeis = () => prisma.papel.findMany({ orderBy: { nome: 'asc' } })

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
