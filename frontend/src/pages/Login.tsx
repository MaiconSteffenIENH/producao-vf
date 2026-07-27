import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Botao, Campo, Input } from '../components/ui'
import { useAuth } from '../store/auth'
import { mensagemDoErro } from '../services/api'

/*
 * A porta de entrada. Numa marca que vende peça feita à mão, o login não pode
 * parecer formulário de ERP: é a primeira coisa que a Vera e a Gabi veem todo
 * dia. A logo real, a serifada da loja e o fundo com grão fazem esse trabalho
 * sem tirar nada da clareza do formulário.
 */
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* halo quente atrás do cartão: dá profundidade sem pesar a tela */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgb(187 165 140 / 0.30), transparent 68%)' }}
      />

      <div className="anima-surgir relative z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <img
            src="/logo-vf.png"
            alt="Vera Flesch Cerâmica"
            width={132}
            height={132}
            className="mx-auto h-[132px] w-[132px] select-none object-contain"
          />
          <p className="mt-1 text-[11px] uppercase tracking-[0.32em] text-tinta-fraca">Produção</p>
        </div>

        <form onSubmit={enviar} className="rounded-2xl border border-borda bg-superficie p-6 shadow-media">
          <div className="flex flex-col gap-4">
            <Campo rotulo="E-mail">
              <Input
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@veraflesch.com.br"
                required
                autoFocus
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

            {erro && (
              <p className="anima-aparecer rounded-xl border border-perigo/25 bg-perigo/8 px-3.5 py-2.5 text-sm leading-relaxed text-perigo">
                {erro}
              </p>
            )}

            <Botao type="submit" disabled={enviando} className="mt-1 w-full py-3">
              {enviando ? 'Entrando…' : 'Entrar'}
            </Botao>
          </div>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-tinta-fraca">
          Esqueceu a senha? Peça para quem administra o sistema redefinir.
        </p>
      </div>
    </div>
  )
}
