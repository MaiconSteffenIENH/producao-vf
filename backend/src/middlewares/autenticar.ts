import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../lib/erros'
import { lerToken, type Sessao } from '../lib/token'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessao?: Sessao
    }
  }
}

export function autenticar(req: Request, _res: Response, next: NextFunction) {
  const cabecalho = req.headers.authorization
  if (!cabecalho?.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Faça login para continuar.'))
  }
  try {
    req.sessao = lerToken(cabecalho.slice(7))
    next()
  } catch (e) {
    next(e)
  }
}

/** Só quem tem papel admin (gestao) passa. */
export function somenteAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.sessao?.admin) return next(new HttpError(403, 'Você não tem permissão para isso.'))
  next()
}
