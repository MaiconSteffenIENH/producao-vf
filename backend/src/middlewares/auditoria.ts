import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../lib/prisma'

const METODOS_QUE_MUDAM = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Registra quem mexeu no quê. Nunca derruba a requisição se o log falhar. */
export function auditar(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => {
    if (!METODOS_QUE_MUDAM.has(req.method)) return
    if (res.statusCode >= 400) return
    if (req.path.startsWith('/auth')) return

    const recurso = req.path.split('/').filter(Boolean)[0] ?? '?'
    prisma.logAtividade
      .create({
        data: {
          usuarioId: req.sessao?.id ?? null,
          usuarioNome: req.sessao?.nome ?? 'anônimo',
          metodo: req.method,
          recurso,
          caminho: req.originalUrl,
          entidadeId: typeof req.params.id === 'string' ? req.params.id : null,
        },
      })
      .catch(() => {})
  })
  next()
}
