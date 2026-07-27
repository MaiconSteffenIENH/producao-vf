import axios from 'axios'

/*
 * O Vite embute VITE_API_URL no bundle em tempo de BUILD, não em runtime.
 * Se ela faltar no build de produção, o app cai no localhost e a pessoa vê
 * "sem conexão" sem nenhuma pista do motivo — já custou tempo. Aqui a falta
 * é detectada e dita em voz alta.
 */
export const faltaUrlDaApi = import.meta.env.PROD && !import.meta.env.VITE_API_URL

if (faltaUrlDaApi) {
  console.error(
    '[Produção VF] VITE_API_URL não estava definida quando este build foi gerado.\n' +
      'Defina a variável na hospedagem (a URL da API, sem barra no fim) e gere um build NOVO — ' +
      'redeploy reaproveitando cache mantém o valor antigo embutido.',
  )
}

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
    if (erro.code === 'ERR_NETWORK') {
      if (faltaUrlDaApi) {
        return 'Este build não sabe o endereço da API (VITE_API_URL faltou na hora de compilar). Refaça o deploy sem reaproveitar o cache.'
      }
      // O plano gratuito do Render hiberna: a primeira chamada do dia demora.
      return 'Sem conexão com o servidor. Se ele estava parado, pode levar até um minuto para acordar — tente de novo.'
    }
  }
  return padrao
}
