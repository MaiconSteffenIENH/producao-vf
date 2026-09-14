import { request } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { ARQUIVO_ESTADO, URL_API, URL_APP, USUARIO } from './ambiente'

/*
 * Login uma vez, por API, e o token vai para o localStorage de todo contexto.
 * Logar pela tela em cada teste custaria segundos e testaria o login 45 vezes;
 * o login tem o próprio cenário (BDD-13 do documento, UC-13).
 *
 * O usuário do seed nasce com senha provisória: o primeiro acesso é obrigado a
 * trocar. Aqui a troca é feita uma vez e o restante usa a senha definitiva.
 */
export default async function setupGlobal() {
  const api = await request.newContext({ baseURL: URL_API })

  let resposta = await api.post('/auth/login', { data: { email: USUARIO.email, senha: USUARIO.senha } })
  if (!resposta.ok()) {
    resposta = await api.post('/auth/login', { data: { email: USUARIO.email, senha: USUARIO.senhaDoSeed } })
    if (!resposta.ok()) throw new Error(`login falhou (${resposta.status()}): ${await resposta.text()}`)
    const { token } = (await resposta.json()) as { token: string }
    const troca = await api.post('/auth/trocar-senha', {
      headers: { Authorization: `Bearer ${token}` },
      data: { senhaAtual: USUARIO.senhaDoSeed, senhaNova: USUARIO.senha },
    })
    if (!troca.ok()) throw new Error(`troca de senha falhou (${troca.status()}): ${await troca.text()}`)
    resposta = await api.post('/auth/login', { data: { email: USUARIO.email, senha: USUARIO.senha } })
  }
  const { token } = (await resposta.json()) as { token: string }

  mkdirSync('.auth', { recursive: true })
  writeFileSync(
    ARQUIVO_ESTADO,
    JSON.stringify({
      cookies: [],
      origins: [{ origin: URL_APP, localStorage: [{ name: 'vf.token', value: token }] }],
    }),
  )
  await api.dispose()
}
