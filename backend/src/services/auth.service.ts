import bcrypt from 'bcryptjs'
import type { z } from 'zod'
import { prisma } from '../lib/prisma'
import { HttpError } from '../lib/erros'
import { modulosVisiveis } from '../lib/modulos'
import { gerarToken } from '../lib/token'
import { chavesDesligadas } from './modulo.service'
import type { loginSchema, trocarSenhaSchema } from '../schemas'

/*
 * QUEM DECIDE O QUE A PESSOA VÊ É O SERVIDOR.
 *
 * O que sai daqui são as CHAVES, não os módulos inteiros: rótulo, rota e grupo
 * já existem iguais nos dois lados (o registro é copiado e vigiado por teste),
 * e mandá-los de novo a cada login só engordaria a resposta com texto que o
 * app já tem. O que o app NÃO pode ter é a regra — se ele recalculasse quem vê
 * o quê, existiriam duas versões da mesma decisão e um dia elas discordariam,
 * com o menu mostrando uma tela que a API recusa.
 */
async function chavesQueEstaPessoaVe(permissoes: unknown, admin: boolean): Promise<string[]> {
  return modulosVisiveis(await chavesDesligadas(), permissoes, admin).map((m) => m.chave)
}

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
  // os módulos vêm junto do login, e não só do /me: sem isso o menu nasceria
  // vazio na primeira tela depois de entrar e só apareceria num F5
  return {
    token: gerarToken(sessao),
    usuario: {
      ...sessao,
      precisaTrocarSenha: usuario.precisaTrocarSenha,
      modulos: await chavesQueEstaPessoaVe(usuario.papel?.permissoes ?? {}, sessao.admin),
    },
  }
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
  const admin = usuario.papel?.admin ?? false
  const permissoes = usuario.papel?.permissoes ?? {}
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel?.nome ?? 'leitura',
    admin,
    permissoes,
    precisaTrocarSenha: usuario.precisaTrocarSenha,
    responsavel: usuario.responsavel,
    modulos: await chavesQueEstaPessoaVe(permissoes, admin),
  }
}
