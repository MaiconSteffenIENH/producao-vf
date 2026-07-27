import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
  timeout: 30_000,
})

const CHAVE_TOKEN = 'vf.token'

export const guardarToken = (token: string | null) => {
  if (token) localStorage.setItem(CHAVE_TOKEN, token)
  else localStorage.removeItem(CHAVE_TOKEN)
}

export const tokenSalvo = () => localStorage.getItem(CHAVE_TOKEN)

api.interceptors.request.use((config) => {
  const token = tokenSalvo()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (erro) => {
    if (erro?.response?.status === 401 && !erro.config?.url?.includes('/auth/login')) {
      guardarToken(null)
      // deixa o router perceber e mandar pro login
      if (location.pathname !== '/entrar') location.assign('/entrar')
    }
    return Promise.reject(erro)
  },
)

/** Mensagem de erro pronta pra mostrar — o backend sempre manda `mensagem`. */
export function mensagemDoErro(erro: unknown, padrao = 'Não deu certo. Tente de novo.'): string {
  if (axios.isAxiosError(erro)) {
    const m = (erro.response?.data as { mensagem?: string } | undefined)?.mensagem
    if (m) return m
    if (erro.code === 'ERR_NETWORK') return 'Sem conexão com o servidor.'
  }
  return padrao
}
