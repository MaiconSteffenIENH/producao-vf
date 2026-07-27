import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { app, comAuth, EMAIL_ADMIN, SENHA_ADMIN } from './helpers'

describe('autenticação', () => {
  it('entra com e-mail e senha corretos', async () => {
    const r = await request(app).post('/auth/login').send({ email: EMAIL_ADMIN, senha: SENHA_ADMIN })
    expect(r.status).toBe(200)
    expect(r.body.token).toBeTruthy()
    expect(r.body.usuario.precisaTrocarSenha).toBe(true)
  })

  it('recusa senha errada sem dizer se o e-mail existe', async () => {
    const r = await request(app).post('/auth/login').send({ email: EMAIL_ADMIN, senha: 'errada' })
    expect(r.status).toBe(401)
    expect(r.body.mensagem).toBe('E-mail ou senha incorretos.')
  })

  it('devolve a mesma mensagem para e-mail inexistente', async () => {
    const r = await request(app).post('/auth/login').send({ email: 'ninguem@vf.com.br', senha: 'seja-la' })
    expect(r.status).toBe(401)
    expect(r.body.mensagem).toBe('E-mail ou senha incorretos.')
  })

  it('bloqueia rota protegida sem token', async () => {
    const r = await request(app).get('/pecas')
    expect(r.status).toBe(401)
  })

  it('devolve o perfil de quem está logado', async () => {
    const r = await (await comAuth('get', '/me'))
    expect(r.status).toBe(200)
    expect(r.body.email).toBe(EMAIL_ADMIN)
    expect(r.body.admin).toBe(true)
  })
})
