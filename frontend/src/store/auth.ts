import { create } from 'zustand'
import { api, guardarToken, tokenSalvo } from '../services/api'

export type Perfil = {
  id: string
  nome: string
  email: string
  papel: string
  admin: boolean
  precisaTrocarSenha: boolean
  responsavel?: { id: string; nome: string } | null
  /**
   * As chaves de módulo que o SERVIDOR liberou para esta pessoa. Opcional
   * porque a resposta pode vir de uma API mais antiga que o app — ver
   * `useModulosLiberados`.
   */
  modulos?: string[]
}

type Estado = {
  perfil: Perfil | null
  carregando: boolean
  entrar: (email: string, senha: string) => Promise<void>
  sair: () => void
  recarregarPerfil: () => Promise<void>
}

export const useAuth = create<Estado>((set) => ({
  perfil: null,
  carregando: true,

  entrar: async (email, senha) => {
    const { data } = await api.post('/auth/login', { email, senha })
    guardarToken(data.token)
    set({ perfil: data.usuario, carregando: false })
  },

  sair: () => {
    guardarToken(null)
    set({ perfil: null, carregando: false })
  },

  recarregarPerfil: async () => {
    if (!tokenSalvo()) return set({ perfil: null, carregando: false })
    try {
      const { data } = await api.get('/me')
      set({ perfil: data, carregando: false })
    } catch {
      guardarToken(null)
      set({ perfil: null, carregando: false })
    }
  },
}))

/**
 * Os módulos que esta pessoa enxerga, do jeito que o servidor mandou.
 *
 * `null` quer dizer "o servidor não disse" — API mais antiga que o app, ou o
 * intervalo entre publicar um e outro. Nesse caso tudo aparece, que é como o
 * sistema funcionava antes deste recurso existir: sumir com o menu inteiro por
 * causa de um campo que faltou trocaria um incômodo por um apagão. Lista de
 * verdade nunca chega vazia, porque os módulos essenciais sobrevivem a
 * qualquer configuração — por isso vazio é lido como ausência, não como
 * "não vê nada".
 *
 * Devolve a lista do próprio estado, sem copiar: selector do zustand que cria
 * objeto novo a cada leitura renderiza em laço.
 */
export function useModulosLiberados(): readonly string[] | null {
  const chaves = useAuth((e) => e.perfil?.modulos)
  return chaves && chaves.length > 0 ? chaves : null
}
