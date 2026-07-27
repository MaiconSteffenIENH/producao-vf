import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { normalizarBusca } from '../lib/format'
import { avisar } from './Toaster'
import { ConfirmDialog } from './ConfirmDialog'
import { Botao, CabecalhoPagina, Campo, Carregando, Input, Modal, Select, Textarea, Vazio } from './ui'
import { useEffect } from 'react'

export type CampoCrud =
  | { nome: string; rotulo: string; tipo: 'texto' | 'url' | 'textarea'; dica?: string; obrigatorio?: boolean }
  | { nome: string; rotulo: string; tipo: 'numero'; dica?: string; min?: number; passo?: number }
  | { nome: string; rotulo: string; tipo: 'cor'; dica?: string }
  | { nome: string; rotulo: string; tipo: 'booleano'; dica?: string }
  | { nome: string; rotulo: string; tipo: 'select'; opcoes: { valor: string; rotulo: string }[]; dica?: string; permiteVazio?: boolean }

export type Registro = Record<string, unknown> & { id: string; nome: string }

type Props<T extends Registro> = {
  titulo: string
  descricao?: string
  caminho: string
  campos: CampoCrud[]
  valoresIniciais: Record<string, unknown>
  colunas: { rotulo: string; render: (item: T) => ReactNode; className?: string }[]
  /** carrega listas auxiliares antes de abrir o formulário (ex.: responsáveis) */
  aoCarregarAuxiliares?: () => Promise<void>
  textoVazio?: string
}

export function CrudSimples<T extends Registro>({
  titulo,
  descricao,
  caminho,
  campos,
  valoresIniciais,
  colunas,
  aoCarregarAuxiliares,
  textoVazio,
}: Props<T>) {
  const [itens, setItens] = useState<T[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<T | null>(null)
  const [formAberto, setFormAberto] = useState(false)
  const [valores, setValores] = useState<Record<string, unknown>>(valoresIniciais)
  const [salvando, setSalvando] = useState(false)
  const [paraExcluir, setParaExcluir] = useState<T | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const recarregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true)
      try {
        const { data } = await api.get(`/${caminho}`)
        setItens(data)
      } catch (erro) {
        avisar.erro(mensagemDoErro(erro, `Não deu para carregar ${titulo.toLowerCase()}.`))
      } finally {
        setCarregando(false)
      }
    },
    [caminho, titulo],
  )

  useEffect(() => {
    void recarregar()
    void aoCarregarAuxiliares?.()
    // aoCarregarAuxiliares vem de closure da página; recarregar já cobre a lista
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarregar])

  // sem aoVivo: listagem de cadastro não é dado quente
  useAutoRefresh(useCallback(() => void recarregar(true), [recarregar]))

  const filtrados = useMemo(() => {
    const alvo = normalizarBusca(busca)
    if (!alvo) return itens
    return itens.filter((i) => normalizarBusca(String(i.nome ?? '')).includes(alvo))
  }, [itens, busca])

  const abrirNovo = () => {
    setEditando(null)
    setValores(valoresIniciais)
    setFormAberto(true)
  }

  const abrirEdicao = (item: T) => {
    setEditando(item)
    const preenchido: Record<string, unknown> = { ...valoresIniciais }
    for (const chave of Object.keys(valoresIniciais)) {
      preenchido[chave] = item[chave] ?? valoresIniciais[chave]
    }
    setValores(preenchido)
    setFormAberto(true)
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      if (editando) await api.put(`/${caminho}/${editando.id}`, valores)
      else await api.post(`/${caminho}`, valores)
      avisar.ok(editando ? 'Alterações salvas.' : 'Cadastrado.')
      setFormAberto(false)
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para salvar.'))
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async () => {
    if (!paraExcluir) return
    setExcluindo(true)
    try {
      await api.delete(`/${caminho}/${paraExcluir.id}`)
      avisar.ok('Excluído.')
      setParaExcluir(null)
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para excluir.'))
    } finally {
      setExcluindo(false)
    }
  }

  const definir = (nome: string, valor: unknown) => setValores((v) => ({ ...v, [nome]: valor }))

  return (
    <>
      <CabecalhoPagina
        titulo={titulo}
        descricao={descricao}
        acoes={
          <>
            {/* largura custom precisa de wrapper: Input tem w-full na base */}
            <div className="w-full sm:w-56">
              <Input placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Botao onClick={abrirNovo}>
              <Plus size={16} /> Novo
            </Botao>
          </>
        }
      />

      {carregando ? (
        <Carregando />
      ) : filtrados.length === 0 ? (
        <Vazio
          titulo={busca ? 'Nada encontrado' : (textoVazio ?? 'Nada cadastrado ainda')}
          descricao={busca ? 'Tente outro termo.' : undefined}
          acao={!busca ? <Botao onClick={abrirNovo}>Cadastrar o primeiro</Botao> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="bg-superficie-2 text-left text-xs uppercase tracking-wide text-tinta-fraca">
              <tr>
                {colunas.map((c) => (
                  <th key={c.rotulo} className={`px-4 py-3 font-medium ${c.className ?? ''}`}>
                    {c.rotulo}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((item) => (
                <tr key={item.id} className="border-t border-borda">
                  {colunas.map((c) => (
                    <td key={c.rotulo} className={`px-4 py-3 align-middle ${c.className ?? ''}`}>
                      {c.render(item)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => abrirEdicao(item)}
                        aria-label={`Editar ${item.nome}`}
                        className="rounded-lg p-2 text-tinta-fraca hover:bg-superficie-2 hover:text-tinta"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setParaExcluir(item)}
                        aria-label={`Excluir ${item.nome}`}
                        className="rounded-lg p-2 text-tinta-fraca hover:bg-superficie-2 hover:text-perigo"
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
        titulo={editando ? `Editar ${editando.nome}` : `Novo em ${titulo}`}
      >
        <form onSubmit={salvar} className="flex flex-col gap-4">
          {campos.map((campo) => {
            const valor = valores[campo.nome]
            if (campo.tipo === 'booleano') {
              return (
                <label key={campo.nome} className="flex items-center gap-2 text-sm text-tinta">
                  <input
                    type="checkbox"
                    checked={Boolean(valor)}
                    onChange={(e) => definir(campo.nome, e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-marca)]"
                  />
                  <span>
                    {campo.rotulo}
                    {campo.dica && <span className="block text-xs text-tinta-fraca">{campo.dica}</span>}
                  </span>
                </label>
              )
            }
            if (campo.tipo === 'select') {
              return (
                <Campo key={campo.nome} rotulo={campo.rotulo} dica={campo.dica}>
                  <Select value={String(valor ?? '')} onChange={(e) => definir(campo.nome, e.target.value)}>
                    {campo.permiteVazio && <option value="">— nenhum —</option>}
                    {campo.opcoes.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.rotulo}
                      </option>
                    ))}
                  </Select>
                </Campo>
              )
            }
            if (campo.tipo === 'cor') {
              return (
                <Campo key={campo.nome} rotulo={campo.rotulo} dica={campo.dica}>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={String(valor ?? '#CCCCCC')}
                      onChange={(e) => definir(campo.nome, e.target.value.toUpperCase())}
                      className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-borda bg-superficie p-1"
                      aria-label={campo.rotulo}
                    />
                    <Input
                      value={String(valor ?? '')}
                      onChange={(e) => definir(campo.nome, e.target.value.toUpperCase())}
                      placeholder="#RRGGBB"
                      maxLength={7}
                    />
                  </div>
                </Campo>
              )
            }
            if (campo.tipo === 'numero') {
              return (
                <Campo key={campo.nome} rotulo={campo.rotulo} dica={campo.dica}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={campo.min ?? 0}
                    step={campo.passo ?? 1}
                    value={valor === null || valor === undefined ? '' : String(valor)}
                    onChange={(e) => definir(campo.nome, e.target.value === '' ? null : Number(e.target.value))}
                  />
                </Campo>
              )
            }
            if (campo.tipo === 'textarea') {
              return (
                <Campo key={campo.nome} rotulo={campo.rotulo} dica={campo.dica}>
                  <Textarea
                    rows={3}
                    maxLength={300}
                    value={String(valor ?? '')}
                    onChange={(e) => definir(campo.nome, e.target.value)}
                  />
                </Campo>
              )
            }
            return (
              <Campo key={campo.nome} rotulo={campo.rotulo} dica={campo.dica}>
                <Input
                  type={campo.tipo === 'url' ? 'url' : 'text'}
                  required={campo.obrigatorio}
                  maxLength={120}
                  value={String(valor ?? '')}
                  onChange={(e) => definir(campo.nome, e.target.value)}
                />
              </Campo>
            )
          })}

          {/* botões lado a lado, não empilhados */}
          <div className="mt-1 flex flex-wrap justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setFormAberto(false)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Botao>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        aberto={Boolean(paraExcluir)}
        titulo="Excluir registro"
        mensagem={`Excluir "${paraExcluir?.nome}"? Se ele estiver em uso em algum lugar, o sistema recusa e explica onde.`}
        textoConfirmar="Excluir"
        perigo
        ocupado={excluindo}
        aoConfirmar={excluir}
        aoCancelar={() => setParaExcluir(null)}
      />
    </>
  )
}
