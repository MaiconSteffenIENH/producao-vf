import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { dataBr } from '../lib/format'
import { avisar } from '../components/Toaster'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Botao, CabecalhoPagina, Campo, Carregando, Etiqueta, Input, Modal, Select, Vazio } from '../components/ui'
import { useAuth } from '../store/auth'

type Papel = { id: string; nome: string; admin: boolean }
type Usuario = {
  id: string
  nome: string
  email: string
  ativo: boolean
  precisaTrocarSenha: boolean
  criadoEm: string
  papel: Papel | null
}

export function Usuarios() {
  const eu = useAuth((e) => e.perfil)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [papeis, setPapeis] = useState<Papel[]>([])
  const [carregando, setCarregando] = useState(true)
  const [formAberto, setFormAberto] = useState(false)
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [form, setForm] = useState({ nome: '', email: '', papelId: '', ativo: true })
  const [salvando, setSalvando] = useState(false)
  const [paraExcluir, setParaExcluir] = useState<Usuario | null>(null)
  const [paraRedefinir, setParaRedefinir] = useState<Usuario | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [senhaGerada, setSenhaGerada] = useState<{ nome: string; senha: string } | null>(null)

  const recarregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const [u, p] = await Promise.all([api.get('/usuarios'), api.get('/papeis')])
      setUsuarios(u.data)
      setPapeis(p.data)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para carregar os usuários.'))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  useAutoRefresh(useCallback(() => void recarregar(true), [recarregar]))

  const abrirNovo = () => {
    setEditando(null)
    setForm({ nome: '', email: '', papelId: papeis.find((p) => !p.admin)?.id ?? papeis[0]?.id ?? '', ativo: true })
    setFormAberto(true)
  }

  const abrirEdicao = (u: Usuario) => {
    setEditando(u)
    setForm({ nome: u.nome, email: u.email, papelId: u.papel?.id ?? '', ativo: u.ativo })
    setFormAberto(true)
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      if (editando) {
        await api.put(`/usuarios/${editando.id}`, form)
        avisar.ok('Usuário atualizado.')
      } else {
        const { data } = await api.post('/usuarios', form)
        setSenhaGerada({ nome: data.nome, senha: data.senhaProvisoria })
      }
      setFormAberto(false)
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para salvar.'))
    } finally {
      setSalvando(false)
    }
  }

  const redefinir = async () => {
    if (!paraRedefinir) return
    setOcupado(true)
    try {
      const { data } = await api.post(`/usuarios/${paraRedefinir.id}/redefinir-senha`)
      setSenhaGerada({ nome: paraRedefinir.nome, senha: data.senhaProvisoria })
      setParaRedefinir(null)
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para redefinir.'))
    } finally {
      setOcupado(false)
    }
  }

  const excluir = async () => {
    if (!paraExcluir) return
    setOcupado(true)
    try {
      await api.delete(`/usuarios/${paraExcluir.id}`)
      avisar.ok('Usuário excluído.')
      setParaExcluir(null)
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para excluir.'))
    } finally {
      setOcupado(false)
    }
  }

  if (carregando) return <Carregando />

  return (
    <>
      <CabecalhoPagina
        titulo="Usuários"
        descricao="Quem entra no sistema e com qual permissão."
        acoes={
          <Botao onClick={abrirNovo}>
            <Plus size={16} /> Novo usuário
          </Botao>
        }
      />

      {usuarios.length === 0 ? (
        <Vazio titulo="Nenhum usuário" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="bg-superficie-2 text-left text-xs uppercase tracking-wide text-tinta-fraca">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Papel</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Desde</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-borda">
                  <td className="px-4 py-3">
                    <p className="font-medium text-tinta">
                      {u.nome}
                      {u.id === eu?.id && <span className="ml-2 text-xs text-tinta-fraca">(você)</span>}
                    </p>
                    <p className="text-xs text-tinta-fraca">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Etiqueta cor={u.papel?.admin ? '#B8963E' : '#918787'}>{u.papel?.nome ?? '—'}</Etiqueta>
                  </td>
                  <td className="hidden px-4 py-3 text-tinta-fraca md:table-cell">{dataBr(u.criadoEm)}</td>
                  <td className="px-4 py-3">
                    {!u.ativo ? (
                      <span className="text-tinta-fraca">Inativo</span>
                    ) : u.precisaTrocarSenha ? (
                      <span className="text-alerta">Senha provisória</span>
                    ) : (
                      'Ativo'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => setParaRedefinir(u)}
                        aria-label={`Redefinir senha de ${u.nome}`}
                        className="rounded-lg p-2 text-tinta-fraca hover:bg-superficie-2 hover:text-tinta"
                      >
                        <KeyRound size={16} />
                      </button>
                      <button
                        onClick={() => abrirEdicao(u)}
                        aria-label={`Editar ${u.nome}`}
                        className="rounded-lg p-2 text-tinta-fraca hover:bg-superficie-2 hover:text-tinta"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setParaExcluir(u)}
                        disabled={u.id === eu?.id}
                        aria-label={`Excluir ${u.nome}`}
                        className="rounded-lg p-2 text-tinta-fraca hover:bg-superficie-2 hover:text-perigo disabled:opacity-30"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        titulo={editando ? `Editar ${editando.nome}` : 'Novo usuário'}
        largura="max-w-lg"
      >
        <form onSubmit={salvar} className="flex flex-col gap-4">
          <Campo rotulo="Nome">
            <Input required maxLength={80} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Campo>
          <Campo rotulo="E-mail">
            <Input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Papel" dica="gestão vê tudo; produção move lotes; leitura só consulta.">
            <Select required value={form.papelId} onChange={(e) => setForm({ ...form, papelId: e.target.value })}>
              <option value="">— escolha —</option>
              {papeis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <label className="flex items-center gap-2 text-sm text-tinta">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              className="h-4 w-4 accent-[var(--color-marca)]"
            />
            Usuário ativo
          </label>
          {!editando && (
            <p className="rounded-lg bg-superficie-2 p-3 text-xs text-tinta-fraca">
              Uma senha provisória será gerada e mostrada uma única vez. A pessoa troca no primeiro acesso.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setFormAberto(false)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Botao>
          </div>
        </form>
      </Modal>

      <Modal
        aberto={Boolean(senhaGerada)}
        aoFechar={() => setSenhaGerada(null)}
        titulo="Senha provisória"
        largura="max-w-md"
      >
        <p className="text-sm text-tinta">
          Anote agora e repasse para <strong>{senhaGerada?.nome}</strong>. Ela não vai aparecer de novo.
        </p>
        <p className="mt-3 rounded-lg bg-superficie-2 px-4 py-3 text-center font-mono text-xl tracking-widest text-tinta">
          {senhaGerada?.senha}
        </p>
        <div className="mt-4 flex justify-end">
          <Botao onClick={() => setSenhaGerada(null)}>Anotei</Botao>
        </div>
      </Modal>

      <ConfirmDialog
        aberto={Boolean(paraRedefinir)}
        titulo="Redefinir senha"
        mensagem={`Gerar uma senha provisória para ${paraRedefinir?.nome}? A senha atual deixa de funcionar na hora.`}
        textoConfirmar="Gerar"
        ocupado={ocupado}
        aoConfirmar={redefinir}
        aoCancelar={() => setParaRedefinir(null)}
      />

      <ConfirmDialog
        aberto={Boolean(paraExcluir)}
        titulo="Excluir usuário"
        mensagem={`Excluir ${paraExcluir?.nome}? O histórico de auditoria continua guardado.`}
        textoConfirmar="Excluir"
        perigo
        ocupado={ocupado}
        aoConfirmar={excluir}
        aoCancelar={() => setParaExcluir(null)}
      />
    </>
  )
}
