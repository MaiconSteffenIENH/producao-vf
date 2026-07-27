import bcrypt from 'bcryptjs'
import type { z } from 'zod'
import { prisma } from '../lib/prisma'
import { HttpError } from '../lib/erros'
import { gerarToken } from '../lib/token'
import type { loginSchema, trocarSenhaSchema } from '../schemas'

export async function login(dados: z.infer<typeof loginSchema>) {
  const usuario = await prisma.usuario.findUnique({
    where: { email: dados.email.toLowerCase() },
    include: { papel: true },
  })
  // mensagem única pros dois casos: não entrega quais e-mails existem
  const generico = new HttpError(401, 'E-mail ou senha incorretos.')
  if (!usuario || !usuario.ativo) throw generico
  if (!(await bcrypt.compare(dados.senha, usuario.senhaHash))) throw generico

  const sessao = {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel?.nome ?? 'leitura',
    admin: usuario.papel?.admin ?? false,
  }
  return { token: gerarToken(sessao), usuario: { ...sessao, precisaTrocarSenha: usuario.precisaTrocarSenha } }
}

export async function trocarSenha(usuarioId: string, dados: z.infer<typeof trocarSenhaSchema>) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } })
  if (!usuario) throw new HttpError(404, 'Usuário não encontrado.')
  if (!(await bcrypt.compare(dados.senhaAtual, usuario.senhaHash))) {
    throw new HttpError(401, 'A senha atual está incorreta.')
  }
  if (await bcrypt.compare(dados.senhaNova, usuario.senhaHash)) {
    throw new HttpError(422, 'A senha nova precisa ser diferente da atual.')
  }
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { senhaHash: await bcrypt.hash(dados.senhaNova, 10), precisaTrocarSenha: false },
  })
}

export async function perfil(usuarioId: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: { papel: true, responsavel: { select: { id: true, nome: true } } },
  })
  if (!usuario) throw new HttpError(404, 'Usuário não encontrado.')
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel?.nome ?? 'leitura',
    admin: usuario.papel?.admin ?? false,
    permissoes: usuario.papel?.permissoes ?? {},
    precisaTrocarSenha: usuario.precisaTrocarSenha,
    responsavel: usuario.responsavel,
  }
}
