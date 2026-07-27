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
