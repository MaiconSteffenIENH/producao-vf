import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { HttpError } from '../lib/erros'

export function tratarErros(erro: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (erro instanceof HttpError) {
    return res.status(erro.status).json({ mensagem: erro.message, detalhes: erro.detalhes })
  }
  if (erro instanceof ZodError) {
    const primeiro = erro.issues[0]
    return res.status(400).json({
      mensagem: primeiro ? `${primeiro.path.join('.')}: ${primeiro.message}` : 'Dados inválidos.',
      detalhes: erro.issues,
    })
  }
  // Prisma: violação de unique
  const codigo = (erro as { code?: string })?.code
  if (codigo === 'P2002') {
    return res.status(409).json({ mensagem: 'Já existe um registro com esse nome.' })
  }
  if (codigo === 'P2003' || codigo === 'P2014') {
    return res.status(409).json({ mensagem: 'Não dá para excluir: existe algo ligado a este registro.' })
  }
  if (codigo === 'P2025') {
    return res.status(404).json({ mensagem: 'Registro não encontrado.' })
  }

  console.error('[erro não tratado]', erro)
  res.status(500).json({ mensagem: 'Erro inesperado no servidor.' })
}
