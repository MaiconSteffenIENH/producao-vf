import { useState } from 'react'
import { api, mensagemDoErro } from '../services/api'
import { avisar } from '../components/Toaster'
import { Botao, CabecalhoPagina, Campo, Card, Input } from '../components/ui'
import { useAuth } from '../store/auth'

export function Ajustes() {
  const { perfil, recarregarPerfil } = useAuth()
  const [senhaAtual, setSenhaAtual] = useState('')
  const [senhaNova, setSenhaNova] = useState('')
  const [repetir, setRepetir] = useState('')
  const [salvando, setSalvando] = useState(false)

  const trocar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (senhaNova !== repetir) return avisar.erro('A confirmação não bate com a senha nova.')
    setSalvando(true)
    try {
      await api.post('/auth/trocar-senha', { senhaAtual, senhaNova })
      avisar.ok('Senha trocada.')
      setSenhaAtual('')
      setSenhaNova('')
      setRepetir('')
      await recarregarPerfil()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para trocar a senha.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <CabecalhoPagina titulo="Ajustes" descricao="Seu acesso ao sistema." />

      {perfil?.precisaTrocarSenha && (
        <div className="mb-4 rounded-xl border border-alerta/40 bg-alerta/10 p-4 text-sm text-tinta">
          Sua senha é provisória. Troque agora para liberar o resto do sistema.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-tinta">Trocar senha</h2>
          <form onSubmit={trocar} className="flex flex-col gap-4">
            <Campo rotulo="Senha atual">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
              />
            </Campo>
            <Campo rotulo="Senha nova" dica="Pelo menos 8 caracteres.">
              <Input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={senhaNova}
                onChange={(e) => setSenhaNova(e.target.value)}
              />
            </Campo>
            <Campo rotulo="Repita a senha nova">
              <Input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={repetir}
                onChange={(e) => setRepetir(e.target.value)}
              />
            </Campo>
            <div className="flex justify-end">
              <Botao type="submit" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Trocar senha'}
              </Botao>
            </div>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold text-tinta">Seu acesso</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-fraca">Nome</dt>
              <dd className="text-tinta">{perfil?.nome}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-fraca">E-mail</dt>
              <dd className="truncate text-tinta">{perfil?.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-fraca">Papel</dt>
              <dd className="text-tinta">{perfil?.papel}</dd>
            </div>
            {perfil?.responsavel && (
              <div className="flex justify-between gap-4">
                <dt className="text-tinta-fraca">Responsável na produção</dt>
                <dd className="text-tinta">{perfil.responsavel.nome}</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-xs text-tinta-fraca">
            O tema claro/escuro fica no ícone de lua no topo, e a preferência é lembrada neste aparelho.
          </p>
        </Card>
      </div>
    </>
  )
}
