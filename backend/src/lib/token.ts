import jwt from 'jsonwebtoken'
import { HttpError } from './erros'

export type Sessao = { id: string; nome: string; email: string; papel: string; admin: boolean }

function segredo(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET não configurado.')
  return s
}

export const gerarToken = (s: Sessao) => jwt.sign(s, segredo(), { expiresIn: '30d' })

export function lerToken(token: string): Sessao {
  try {
    return jwt.verify(token, segredo()) as Sessao
  } catch {
    throw new HttpError(401, 'Sessão expirada. Entre de novo.')
  }
}
