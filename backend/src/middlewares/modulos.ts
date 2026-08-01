/*
 * O GUARDA DA API — esconder o menu não é permissão.
 *
 * Se a tela some mas a rota continua respondendo, o dado está a um `curl` de
 * distância e a "permissão" é enfeite. Este middleware fecha o outro lado: ele
 * lê o MESMO registro que monta o menu (lib/modulos.ts) e recusa a requisição
 * quando o módulo não está disponível para quem chamou.
 *
 * DUAS PROTEÇÕES CONTRA TRANCAR O ATELIÊ INTEIRO, que é o modo de falha caro
 * aqui — bloqueio errado não avisa, só faz o sistema "parar de funcionar":
 *
 *   1. Prefixo que não está em MODULOS_POR_ROTA PASSA. Fosse ao contrário,
 *      toda rota nova nasceria bloqueada até alguém lembrar de mapeá-la, e o
 *      sintoma seria um 403 num recurso que ninguém desligou.
 *   2. /auth, /me, /health e /ajustes passam sempre. São o caminho de entrar,
 *      de saber quem se é, de o monitor responder e de trocar a senha
 *      provisória — sem eles um engano de configuração não teria conserto
 *      pela própria tela.
 *
 * A permissão do papel é lida do banco a cada requisição, e não do token: o
 * token vale 30 dias, e tirar um módulo de um papel só valeria depois que a
 * pessoa saísse e entrasse de novo.
 */
import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../lib/erros'
import { avaliarAcesso } from '../lib/guarda-modulos'
import { chavesDesligadas } from '../services/modulo.service'
import { permissoesDoUsuario } from '../services/usuario.service'

const SEMPRE_LIBERADOS = new Set(['auth', 'me', 'health', 'ajustes'])

export function exigirModulo(req: Request, _res: Response, next: NextFunction) {
  /*
   * `.then(ok, falhou)` e não `.then(...).catch(...)`: encadeado, o catch fica
   * DEPOIS do then e passa a capturar também o que for lançado lá adiante, por
   * qualquer rota da aplicação. O guarda viraria um `try` gigante em volta do
   * sistema inteiro, e erro de outra pessoa chegaria aqui disfarçado.
   */
  conferirAcesso(req).then((erro) => next(erro), next)
}

/** Devolve o erro que barra a requisição, ou `undefined` quando ela pode seguir. */
async function conferirAcesso(req: Request): Promise<HttpError | undefined> {
  const sessao = req.sessao
  if (!sessao) {
    // sem sessão o `autenticar` já teria barrado; se chegou aqui, é rota livre
    return avaliarAcesso(req.path, [], null, false).passa
      ? undefined
      : new HttpError(401, 'Faça login para continuar.')
  }

  /*
   * O desligado e a permissão são lidos do BANCO a cada requisição, não do
   * token: o token vale 30 dias, e tirar um módulo de um papel só valeria
   * depois que a pessoa saísse e entrasse de novo.
   */
  const [desligados, permissoes] = await Promise.all([
    chavesDesligadas(),
    permissoesDoUsuario(sessao.id),
  ])

  const veredito = avaliarAcesso(req.path, desligados, permissoes, sessao.admin, req.method)
  return veredito.passa ? undefined : new HttpError(403, veredito.mensagem)
}
