import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2, X } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { brl } from '../lib/format'
import { avisar } from '../components/Toaster'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  Botao,
  CabecalhoPagina,
  Campo,
  Carregando,
  ChipCor,
  Etiqueta,
  Input,
  Modal,
  Select,
  Textarea,
  Vazio,
} from '../components/ui'

type Cor = { id: string; nome: string; hex: string; malhado: boolean; amostraUrl: string | null; ativo: boolean }
type Etapa = { id: string; nome: string; tipo: string; defineCor: boolean; estoqueIntermediario: boolean }
type Responsavel = { id: string; nome: string; cor: string }
type Categoria = { id: string; nome: string }

type Peca = {
  id: string
  nome: string
  categoriaId: string
  categoria: Categoria
  responsavelInicialId: string | null
  responsavelInicial: Responsavel | null
  tempoMedioDias: number
  qtdMinimaDesejada: number
  qtdMinimaBiscoito: number
  precoBase: string | null
  observacao: string | null
  ativo: boolean
  roteiro: { id: string; ordem: number; etapaId: string; etapa: Etapa; responsavelId: string | null; diasEstimados: number }[]
  cores: { id: string; corId: string; qtdMinimaDesejada: number; cor: Cor }[]
}

type LinhaRoteiro = { etapaId: string; responsavelId: string; diasEstimados: number }

const FORM_VAZIO = {
  nome: '',
  categoriaId: '',
  responsavelInicialId: '',
  tempoMedioDias: 30,
  qtdMinimaDesejada: 0,
  qtdMinimaBiscoito: 0,
  precoBase: null as number | null,
  observacao: '',
  ativo: true,
}

export function Pecas() {
  const [pecas, setPecas] = useState<Peca[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cores, setCores] = useState<Cor[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([])

  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')

  const [formAberto, setFormAberto] = useState(false)
  const [editando, setEditando] = useState<Peca | null>(null)
  const [form, setForm] = useState({ ...FORM_VAZIO })
  const [roteiro, setRoteiro] = useState<LinhaRoteiro[]>([])
  const [coresSelecionadas, setCoresSelecionadas] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [paraExcluir, setParaExcluir] = useState<Peca | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const recarregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true)
      try {
        const params = new URLSearchParams()
        if (busca.trim()) params.set('busca', busca.trim())
        if (filtroCategoria) params.set('categoriaId', filtroCategoria)
        const { data } = await api.get(`/pecas?${params.toString()}`)
        setPecas(data)
      } catch (erro) {
        avisar.erro(mensagemDoErro(erro, 'Não deu para carregar as peças.'))
      } finally {
        setCarregando(false)
      }
    },
    [busca, filtroCategoria],
  )

  useEffect(() => {
    const t = setTimeout(() => void recarregar(), 250) // espera parar de digitar
    return () => clearTimeout(t)
  }, [recarregar])

  useEffect(() => {
    Promise.all([api.get('/categorias'), api.get('/cores'), api.get('/etapas'), api.get('/responsaveis')])
      .then(([c, co, e, r]) => {
        setCategorias(c.data)
        setCores(co.data)
        setEtapas(e.data)
        setResponsaveis(r.data)
      })
      .catch((erro) => avisar.erro(mensagemDoErro(erro, 'Não deu para carregar os cadastros de apoio.')))
  }, [])

  useAutoRefresh(useCallback(() => void recarregar(true), [recarregar]))

  const etapaQueDefineCor = useMemo(() => etapas.find((e) => e.defineCor), [etapas])

  const abrirNova = () => {
    setEditando(null)
    setForm({ ...FORM_VAZIO, categoriaId: categorias[0]?.id ?? '' })
    setRoteiro([])
    setCoresSelecionadas([])
    setFormAberto(true)
  }

  const abrirEdicao = (peca: Peca) => {
    setEditando(peca)
    setForm({
      nome: peca.nome,
      categoriaId: peca.categoriaId,
      responsavelInicialId: peca.responsavelInicialId ?? '',
      tempoMedioDias: peca.tempoMedioDias,
      qtdMinimaDesejada: peca.qtdMinimaDesejada,
      qtdMinimaBiscoito: peca.qtdMinimaBiscoito,
      precoBase: peca.precoBase === null ? null : Number(peca.precoBase),
      observacao: peca.observacao ?? '',
      ativo: peca.ativo,
    })
    setRoteiro(
      peca.roteiro.map((r) => ({
        etapaId: r.etapaId,
        responsavelId: r.responsavelId ?? '',
        diasEstimados: r.diasEstimados,
      })),
    )
    setCoresSelecionadas(peca.cores.map((c) => c.corId))
    setFormAberto(true)
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      const corpo = {
        ...form,
        precoBase: form.precoBase,
        roteiro: roteiro.filter((r) => r.etapaId),
        cores: coresSelecionadas.map((corId) => ({ corId, qtdMinimaDesejada: 0 })),
      }
      if (editando) await api.put(`/pecas/${editando.id}`, corpo)
      else await api.post('/pecas', corpo)
      avisar.ok(editando ? 'Peça atualizada.' : 'Peça cadastrada.')
      setFormAberto(false)
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para salvar a peça.'))
    } finally {
      setSalvando(false)
    }
  }

  const duplicar = async (peca: Peca) => {
    try {
      await api.post(`/pecas/${peca.id}/duplicar`)
      avisar.ok('Cópia criada como inativa — revise e ative.')
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para duplicar.'))
    }
  }

  const excluir = async () => {
    if (!paraExcluir) return
    setExcluindo(true)
    try {
      await api.delete(`/pecas/${paraExcluir.id}`)
      avisar.ok('Peça excluída.')
      setParaExcluir(null)
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para excluir.'))
    } finally {
      setExcluindo(false)
    }
  }

  // ── roteiro ───────────────────────────────────────────
  const adicionarEtapa = () => setRoteiro((r) => [...r, { etapaId: '', responsavelId: '', diasEstimados: 1 }])
  const removerEtapa = (i: number) => setRoteiro((r) => r.filter((_, idx) => idx !== i))
  const moverEtapa = (i: number, direcao: -1 | 1) =>
    setRoteiro((r) => {
      const destino = i + direcao
      if (destino < 0 || destino >= r.length) return r
      const copia = [...r]
      ;[copia[i], copia[destino]] = [copia[destino], copia[i]]
      return copia
    })
  const alterarEtapa = (i: number, campo: keyof LinhaRoteiro, valor: string | number) =>
    setRoteiro((r) => r.map((linha, idx) => (idx === i ? { ...linha, [campo]: valor } : linha)))

  const roteiroTemEtapaDeCor = etapaQueDefineCor
    ? roteiro.some((r) => r.etapaId === etapaQueDefineCor.id)
    : true

  return (
    <>
      <CabecalhoPagina
        titulo="Peças"
        descricao="O que o ateliê produz. A cor não entra no nome — ela é escolhida depois do biscoito."
        acoes={
          <>
            <div className="w-full sm:w-52">
              <Input placeholder="Buscar peça…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="w-full sm:w-48">
              <Select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
                <option value="">Todas as categorias</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </div>
            <Botao onClick={abrirNova}>
              <Plus size={16} /> Nova peça
            </Botao>
          </>
        }
      />

      {carregando ? (
        <Carregando />
      ) : pecas.length === 0 ? (
        <Vazio
          titulo="Nenhuma peça encontrada"
          descricao="Cadastre as peças do ateliê para o planejamento poder sugerir produção."
          acao={<Botao onClick={abrirNova}>Cadastrar peça</Botao>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pecas.map((peca) => (
            <article key={peca.id} className="flex flex-col rounded-xl border border-borda bg-superficie p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-titulo text-lg text-tinta">{peca.nome}</h2>
                  <p className="text-xs text-tinta-fraca">{peca.categoria?.nome}</p>
                </div>
                {!peca.ativo && <Etiqueta cor="#918787">inativa</Etiqueta>}
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-tinta">
                <span>
                  Mínimo pronto: <strong>{peca.qtdMinimaDesejada}</strong>
                </span>
                <span>
                  Mínimo biscoito: <strong>{peca.qtdMinimaBiscoito}</strong>
                </span>
                <span className="text-tinta-fraca">{brl(peca.precoBase)}</span>
              </div>

              <div className="mt-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-tinta-fraca">Roteiro</p>
                {peca.roteiro.length === 0 ? (
                  <p className="text-sm text-alerta">Sem roteiro — não vira lote.</p>
                ) : (
                  <p className="text-sm text-tinta">
                    {peca.roteiro.map((r) => r.etapa.nome).join(' → ')}
                  </p>
                )}
              </div>

              <div className="mt-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-tinta-fraca">
                  Esmaltes ({peca.cores.length})
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {peca.cores.slice(0, 6).map((c) => (
                    <ChipCor
                      key={c.id}
                      nome={c.cor.nome}
                      hex={c.cor.hex}
                      amostraUrl={c.cor.amostraUrl}
                      malhado={c.cor.malhado}
                      tamanho={16}
                    />
                  ))}
                  {peca.cores.length > 6 && (
                    <span className="text-sm text-tinta-fraca">+{peca.cores.length - 6}</span>
                  )}
                  {peca.cores.length === 0 && <span className="text-sm text-alerta">Nenhum esmalte associado</span>}
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-1 border-t border-borda pt-3">
                <button
                  onClick={() => duplicar(peca)}
                  aria-label={`Duplicar ${peca.nome}`}
                  className="rounded-lg p-2 text-tinta-fraca hover:bg-superficie-2 hover:text-tinta"
                >
                  <Copy size={16} />
                </button>
                <button
                  onClick={() => abrirEdicao(peca)}
                  aria-label={`Editar ${peca.nome}`}
                  className="rounded-lg p-2 text-tinta-fraca hover:bg-superficie-2 hover:text-tinta"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setParaExcluir(peca)}
                  aria-label={`Excluir ${peca.nome}`}
                  className="rounded-lg p-2 text-tinta-fraca hover:bg-superficie-2 hover:text-perigo"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        titulo={editando ? `Editar ${editando.nome}` : 'Nova peça'}
        largura="max-w-3xl"
      >
        <form onSubmit={salvar} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome da peça" dica="Sem a cor no nome: 'Bowl', não 'Bowl Pistache'.">
              <Input
                required
                maxLength={80}
                caixaAlta
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Categoria">
              <Select
                required
                value={form.categoriaId}
                onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}
              >
                <option value="">— escolha —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Responsável inicial">
              <Select
                value={form.responsavelInicialId}
                onChange={(e) => setForm({ ...form, responsavelInicialId: e.target.value })}
              >
                <option value="">— nenhum —</option>
                {responsaveis.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Tempo médio (dias)" dica="Do início ao pronto. A loja anuncia ~30 dias.">
              <Input
                type="number"
                min={1}
                max={365}
                value={form.tempoMedioDias}
                onChange={(e) => setForm({ ...form, tempoMedioDias: Number(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Mínimo desejado pronto">
              <Input
                type="number"
                min={0}
                value={form.qtdMinimaDesejada}
                onChange={(e) => setForm({ ...form, qtdMinimaDesejada: Number(e.target.value) })}
              />
            </Campo>
            <Campo
              rotulo="Mínimo desejado em biscoito"
              dica="O pulmão que permite atender uma cor que saiu bem sem começar do zero."
            >
              <Input
                type="number"
                min={0}
                value={form.qtdMinimaBiscoito}
                onChange={(e) => setForm({ ...form, qtdMinimaBiscoito: Number(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Preço base (R$)" dica="Referência do site. O preço por canal sai na tela de Preços.">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.precoBase ?? ''}
                onChange={(e) => setForm({ ...form, precoBase: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </Campo>
            <label className="flex items-end gap-2 pb-2 text-sm text-tinta">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-marca)]"
              />
              Peça ativa
            </label>
          </div>

          <Campo rotulo="Observação">
            <Textarea
              rows={2}
              maxLength={500}
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </Campo>

          {/* ── Roteiro ───────────────────────────────── */}
          <div className="rounded-xl border border-borda p-3">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-tinta">Roteiro de produção</h3>
                <p className="text-xs text-tinta-fraca">A ordem aqui é a ordem real no ateliê.</p>
              </div>
              <Botao type="button" variante="secundario" onClick={adicionarEtapa}>
                <Plus size={14} /> Adicionar etapa
              </Botao>
            </div>

            {roteiro.length === 0 && (
              <p className="py-2 text-sm text-tinta-fraca">Nenhuma etapa ainda. Sem roteiro a peça não vira lote.</p>
            )}

            <div className="flex flex-col gap-2">
              {roteiro.map((linha, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-lg bg-superficie-2 p-2 sm:flex-row sm:items-center">
                  <span className="w-6 shrink-0 text-center text-sm font-medium text-tinta-fraca">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Select value={linha.etapaId} onChange={(e) => alterarEtapa(i, 'etapaId', e.target.value)}>
                      <option value="">— escolha a etapa —</option>
                      {etapas.map((et) => (
                        <option key={et.id} value={et.id}>
                          {et.nome}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Select
                      value={linha.responsavelId}
                      onChange={(e) => alterarEtapa(i, 'responsavelId', e.target.value)}
                    >
                      <option value="">— responsável padrão —</option>
                      {responsaveis.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.nome}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-full sm:w-24">
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={linha.diasEstimados}
                      onChange={(e) => alterarEtapa(i, 'diasEstimados', Number(e.target.value))}
                      aria-label="Dias estimados"
                    />
                  </div>
                  <div className="flex shrink-0 justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => moverEtapa(i, -1)}
                      disabled={i === 0}
                      aria-label="Subir etapa"
                      className="rounded-lg p-2 text-tinta-fraca hover:bg-superficie disabled:opacity-30"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moverEtapa(i, 1)}
                      disabled={i === roteiro.length - 1}
                      aria-label="Descer etapa"
                      className="rounded-lg p-2 text-tinta-fraca hover:bg-superficie disabled:opacity-30"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removerEtapa(i)}
                      aria-label="Remover etapa"
                      className="rounded-lg p-2 text-tinta-fraca hover:bg-superficie hover:text-perigo"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {roteiro.length > 0 && !roteiroTemEtapaDeCor && etapaQueDefineCor && (
              <p className="mt-2 text-sm text-alerta">
                Este roteiro não passa por “{etapaQueDefineCor.nome}”. O lote chegaria ao fim sem cor e sumiria do
                controle por esmalte.
              </p>
            )}
          </div>

          {/* ── Esmaltes ──────────────────────────────── */}
          <div className="rounded-xl border border-borda p-3">
            <h3 className="text-sm font-semibold text-tinta">Esmaltes possíveis</h3>
            <p className="mb-2 text-xs text-tinta-fraca">
              Quais cores esta peça pode receber. A escolha real acontece depois da queima de biscoito.
            </p>
            <div className="flex flex-wrap gap-2">
              {cores.map((cor) => {
                const marcada = coresSelecionadas.includes(cor.id)
                return (
                  <button
                    type="button"
                    key={cor.id}
                    onClick={() =>
                      setCoresSelecionadas((s) => (marcada ? s.filter((id) => id !== cor.id) : [...s, cor.id]))
                    }
                    className={`rounded-full border px-2.5 py-1 transition ${
                      marcada ? 'border-marca bg-marca/15' : 'border-borda hover:bg-superficie-2'
                    }`}
                  >
                    <ChipCor
                      nome={cor.nome}
                      hex={cor.hex}
                      amostraUrl={cor.amostraUrl}
                      malhado={cor.malhado}
                      tamanho={16}
                    />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setFormAberto(false)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar peça'}
            </Botao>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        aberto={Boolean(paraExcluir)}
        titulo="Excluir peça"
        mensagem={`Excluir "${paraExcluir?.nome}"? O roteiro e os esmaltes associados vão junto.`}
        textoConfirmar="Excluir"
        perigo
        ocupado={excluindo}
        aoConfirmar={excluir}
        aoCancelar={() => setParaExcluir(null)}
      />
    </>
  )
}
