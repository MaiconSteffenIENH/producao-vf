/** Endereços da pilha sob teste. Tudo vem do ambiente; os padrões são os do docker compose. */
export const URL_APP = process.env.E2E_URL ?? 'http://localhost:5173'
export const URL_API = process.env.E2E_API ?? 'http://localhost:3001'

/** O usuário do seed. A senha provisória é trocada uma vez, no setup global. */
export const USUARIO = {
  email: process.env.E2E_EMAIL ?? 'gabi@veraflesch.com.br',
  senhaDoSeed: process.env.E2E_SENHA_SEED ?? 'ceramica123',
  senha: process.env.E2E_SENHA ?? 'ceramica-e2e-2026',
}

export const ARQUIVO_ESTADO = '.auth/estado.json'
