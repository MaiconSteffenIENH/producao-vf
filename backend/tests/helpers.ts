import request from 'supertest'
import { criarApp } from '../src/app'

process.env.JWT_SECRET ??= 'segredo-de-teste'

export const app = criarApp()

export const EMAIL_ADMIN = 'gabi@veraflesch.com.br'
export const SENHA_ADMIN = 'ceramica123'

let cache: string | null = null

export async function tokenAdmin(): Promise<string> {
  if (cache) return cache
  const r = await request(app).post('/auth/login').send({ email: EMAIL_ADMIN, senha: SENHA_ADMIN })
  if (r.status !== 200) throw new Error(`Login de teste falhou (${r.status}): ${JSON.stringify(r.body)}`)
  cache = r.body.token as string
  return cache
}

export async function comAuth(metodo: 'get' | 'post' | 'put' | 'delete', caminho: string) {
  const token = await tokenAdmin()
  return request(app)[metodo](caminho).set('Authorization', `Bearer ${token}`)
}
