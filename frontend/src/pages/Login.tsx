import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Botao, Campo, Input } from '../components/ui'
import { useAuth } from '../store/auth'
import { mensagemDoErro } from '../services/api'

export function Login() {
  const { perfil, entrar } = useAuth()
  const navegar = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (perfil) return <Navigate to="/" replace />

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await entrar(email, senha)
      navegar('/')
    } catch (erroLogin) {
      setErro(mensagemDoErro(erroLogin, 'Não deu para entrar.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-fundo px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-titulo text-5xl leading-none text-ouro">VF</p>
          <h1 className="mt-3 font-titulo text-2xl text-tinta">Vera Flesch Cerâmica</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-tinta-fraca">Produção</p>
        </div>

        <form onSubmit={enviar} className="rounded-2xl border border-borda bg-superficie p-5 shadow-sm">
          <div className="flex flex-col gap-4">
            <Campo rotulo="E-mail">
              <Input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@veraflesch.com.br"
                required
              />
            </Campo>
            <Campo rotulo="Senha">
              <Input
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </Campo>
            {erro && <p className="text-sm text-perigo">{erro}</p>}
            <Botao type="submit" disabled={enviando} className="w-full">
              {enviando ? 'Entrando…' : 'Entrar'}
            </Botao>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-tinta-fraca">
          Esqueceu a senha? Peça para quem administra o sistema redefinir.
        </p>
      </div>
    </div>
  )
}
