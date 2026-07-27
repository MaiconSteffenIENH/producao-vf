import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Plus, Scissors } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { avisar } from '../components/Toaster'
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

type Cor = { id: string; nome: string; hex: string; malhado: boolean; amostraUrl: string | null }
type Cartao = {
  id: string
  codigo: string
  quantidade: number
  proximaEtapaId: string | null
  responsavelSugeridoId: string | null
  peca: { id: string; nome: string; categoria: { nome: string } }
  cor: Cor | null
  loteOrigem: { id: string; codigo: string } | null
}
type Coluna = {
  etapa: { id: string; nome: string; tipo: string; defineCor: boolean; estoqueIntermediario: boolean }
  total: number
  cartoes: Cartao[]
}

type Acao = 'avancar' | 'perda' | 'dividir'

const CORES_TIPO: Record<string, string> = {
  producao: '#BBA58C',
  secagem: '#A9CBDD',
  queima: '#C4703B',
  estoque: '#B8963E',
  final: '#3E5C4B',
}

export function Producao() {
  const [colunas, setColunas] = useState<Coluna[]>([])
  const [pecas, setPecas] = useState<{ id: string; nome: string }[]>([])
  const [cores, setCores] = useState<Cor[]>([])
  const [responsaveis, setResponsaveis] = useState<{ id: string; nome: string }[]>([])
  const [etapas, setEtapas] = useState<{ id: string; nome: string; defineCor: boolean }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroPeca, setFiltroPeca] = useState('')
  const [filtroCor, setFiltroCor] = useState('')

  const [novoAberto, setNovoAberto] = useState(false)
  const [novo, setNovo] = useState({ pecaId: '', quantidade: 20, observacao: '' })

  const [acao, setAcao] = useState<{ tipo: Acao; cartao: Cartao; etapaId: string } | null>(null)
  const [form, setForm] = useState({ quantidade: 0, etapaDestinoId: '', corId: '', responsavelId: '', motivo: '' })
  const [enviando, setEnviando] = useState(false)

  const recarregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true)
      try {
        const params = new URLSearchParams()
        if (filtroPeca) params.set('pecaId', filtroPeca)
        if (filtroCor) params.set('corId', filtroCor)
        const { data } = await api.get(`/lotes/kanban?${params.toString()}`)
        setColunas(data)
      } catch (erro) {
        avisar.erro(mensagemDoErro(erro, 'Não deu para carregar o quadro.'))
      } finally {
        setCarregando(false)
      }
    },
    [filtroPeca, filtroCor],
  )

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  useEffect(() => {
    Promise.all([api.get('/pecas?ativo=true'), api.get('/cores'), api.get('/responsaveis'), api.get('/etapas')])
      .then(([p, c, r, e]) => {
        setPecas(p.data)
        setCores(c.data)
        setResponsaveis(r.data)
        setEtapas(e.data)
      })
      .catch(() => avisar.erro('Não deu para carregar os cadastros.'))
  }, [])

  // dado quente: o Kanban é a tela que a Vera deixa aberta no ateliê
  useAutoRefresh(
    useCallback(() => void recarregar(true), [recarregar]),
    { aoVivo: true, intervaloMs: 15_000 },
  )

  const etapaPorId = useMemo(() => new Map(etapas.map((e) => [e.id, e])), [etapas])

  const abrirAcao = (tipo: Acao, cartao: Cartao, etapaId: string) => {
    setAcao({ tipo, cartao, etapaId })
    setForm({
      quantidade: cartao.quantidade,
      etapaDestinoId: cartao.proximaEtapaId ?? '',
      corId: cartao.cor?.id ?? '',
      responsavelId: cartao.responsavelSugeridoId ?? '',
      motivo: '',
    })
  }

  const destinoDefineCor = Boolean(form.etapaDestinoId && etapaPorId.get(form.etapaDestinoId)?.defineCor)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!acao) return
    setEnviando(true)
    try {
      if (acao.tipo === 'avancar') {
        const { data } = await api.post(`/lotes/${acao.cartao.id}/avancar`, {
          etapaOrigemId: acao.etapaId,
          etapaDestinoId: form.etapaDestinoId,
          quantidade: form.quantidade,
          corId: form.corId || null,
          responsavelId: form.responsavelId || null,
          motivo: form.motivo || null,
        })
        avisar.ok(
          data.loteCriado
            ? `Movido. Parte do lote virou ${data.loteCriado.codigo} com a cor escolhida.`
            : 'Movido.',
        )
      } else if (acao.tipo === 'perda') {
        await api.post(`/lotes/${acao.cartao.id}/perda`, {
          etapaId: acao.etapaId,
          quantidade: form.quantidade,
          motivo: form.motivo,
        })
        avisar.ok('Perda registrada.')
      } else {
        const { data } = await api.post(`/lotes/${acao.cartao.id}/dividir`, {
          etapaId: acao.etapaId,
          quantidade: form.quantidade,
          motivo: form.motivo || null,
        })
        avisar.ok(`Lote dividido: nasceu o ${data.codigo}.`)
      }
      setAcao(null)
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para registrar.'))
    } finally {
      setEnviando(false)
    }
  }

  const criarLote = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    try {
      const { data } = await api.post('/lotes', novo)
      avisar.ok(`Lote ${data.codigo} aberto.`)
      setNovoAberto(false)
      setNovo({ pecaId: '', quantidade: 20, observacao: '' })
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para abrir o lote.'))
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) return <Carregando />

  const vazio = colunas.every((c) => c.cartoes.length === 0)

  return (
    <>
      <CabecalhoPagina
        titulo="Produção"
        descricao="Onde cada lote está agora. Toque no cartão para mover, perder ou dividir."
        acoes={
          <>
            <div className="w-full sm:w-44">
              <Select value={filtroPeca} onChange={(e) => setFiltroPeca(e.target.value)}>
                <option value="">Todas as peças</option>
                {pecas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full sm:w-44">
              <Select value={filtroCor} onChange={(e) => setFiltroCor(e.target.value)}>
                <option value="">Todos os esmaltes</option>
                {cores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </div>
            <Botao onClick={() => setNovoAberto(true)}>
              <Plus size={16} /> Novo lote
            </Botao>
          </>
        }
      />

      {vazio ? (
        <Vazio
          titulo="Nenhum lote em produção"
          descricao="Abra um lote para começar a acompanhar. O planejamento sugere o que vale a pena produzir."
          acao={<Botao onClick={() => setNovoAberto(true)}>Abrir o primeiro lote</Botao>}
        />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
          <div className="flex min-w-max gap-3">
            {colunas.map((coluna) => (
              <section key={coluna.etapa.id} className="w-64 shrink-0">
                <header
                  className="mb-2 flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ backgroundColor: `${CORES_TIPO[coluna.etapa.tipo] ?? '#BBA58C'}22` }}
                >
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-tinta">{coluna.etapa.nome}</h2>
                    {coluna.etapa.defineCor && <span className="text-[11px] text-ouro">define a cor</span>}
                    {coluna.etapa.estoqueIntermediario && (
                      <span className="text-[11px] text-verde">estoque neutro</span>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-tinta">{coluna.total}</span>
                </header>

                <div className="flex flex-col gap-2">
                  {coluna.cartoes.map((cartao) => (
                    <article key={cartao.id} className="rounded-xl border border-borda bg-superficie p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-tinta">{cartao.peca.nome}</p>
                          <p className="text-xs text-tinta-fraca">{cartao.codigo}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-marca/15 px-2 py-0.5 text-sm font-semibold text-tinta">
                          {cartao.quantidade}
                        </span>
                      </div>

                      {cartao.cor ? (
                        <div className="mt-2">
                          <ChipCor
                            nome={cartao.cor.nome}
                            hex={cartao.cor.hex}
                            amostraUrl={cartao.cor.amostraUrl}
                            malhado={cartao.cor.malhado}
                            tamanho={14}
                          />
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-tinta-fraca">sem cor definida</p>
                      )}

                      {cartao.loteOrigem && (
                        <p className="mt-1 text-[11px] text-tinta-fraca">veio do {cartao.loteOrigem.codigo}</p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-1">
                        <button
                          onClick={() => abrirAcao('avancar', cartao, coluna.etapa.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-marca px-2 py-1 text-xs font-medium text-contraste hover:bg-marca-escura"
                        >
                          <ArrowRight size={13} /> Mover
                        </button>
                        <button
                          onClick={() => abrirAcao('perda', cartao, coluna.etapa.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-borda px-2 py-1 text-xs text-tinta hover:bg-superficie-2"
                        >
                          <AlertTriangle size={13} /> Perda
                        </button>
                        <button
                          onClick={() => abrirAcao('dividir', cartao, coluna.etapa.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-borda px-2 py-1 text-xs text-tinta hover:bg-superficie-2"
                        >
                          <Scissors size={13} /> Dividir
                        </button>
                      </div>
                    </article>
                  ))}
                  {coluna.cartoes.length === 0 && (
                    <p className="rounded-xl border border-dashed border-borda px-3 py-6 text-center text-xs text-tinta-fraca">
                      vazio
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {/* ── novo lote ─────────────────────────────── */}
      <Modal aberto={novoAberto} aoFechar={() => setNovoAberto(false)} titulo="Novo lote" largura="max-w-lg">
        <form onSubmit={criarLote} className="flex flex-col gap-4">
          <Campo rotulo="Peça" dica="O lote entra na primeira etapa do roteiro dela.">
            <Select required value={novo.pecaId} onChange={(e) => setNovo({ ...novo, pecaId: e.target.value })}>
              <option value="">— escolha —</option>
              {pecas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Quantidade">
            <Input
              type="number"
              min={1}
              required
              value={novo.quantidade}
              onChange={(e) => setNovo({ ...novo, quantidade: Number(e.target.value) })}
            />
          </Campo>
          <Campo rotulo="Observação">
            <Textarea
              rows={2}
              maxLength={300}
              value={novo.observacao}
              onChange={(e) => setNovo({ ...novo, observacao: e.target.value })}
            />
          </Campo>
          <p className="rounded-lg bg-superficie-2 p-3 text-xs text-tinta-fraca">
            A cor não é escolhida agora. Ela é definida na esmaltação, depois da queima de biscoito.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setNovoAberto(false)} disabled={enviando}>
              Cancelar
            </Botao>
            <Botao type="submit" disabled={enviando}>
              {enviando ? 'Abrindo…' : 'Abrir lote'}
            </Botao>
          </div>
        </form>
      </Modal>

      {/* ── mover / perda / dividir ───────────────── */}
      <Modal
        aberto={Boolean(acao)}
        aoFechar={() => setAcao(null)}
        titulo={
          acao?.tipo === 'avancar'
            ? `Mover ${acao?.cartao.codigo}`
            : acao?.tipo === 'perda'
              ? `Registrar perda em ${acao?.cartao.codigo}`
              : `Dividir ${acao?.cartao.codigo}`
        }
        largura="max-w-lg"
      >
        {acao && (
          <form onSubmit={enviar} className="flex flex-col gap-4">
            <p className="text-sm text-tinta-fraca">
              {acao.cartao.peca.nome} — {acao.cartao.quantidade} peça(s) nesta etapa.
            </p>

            {acao.tipo === 'avancar' && (
              <Campo rotulo="Para qual etapa">
                <Select
                  required
                  value={form.etapaDestinoId}
                  onChange={(e) => setForm({ ...form, etapaDestinoId: e.target.value })}
                >
                  <option value="">— escolha —</option>
                  {etapas
                    .filter((e) => e.id !== acao.etapaId)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                </Select>
              </Campo>
            )}

            <Campo
              rotulo="Quantidade"
              dica={
                acao.tipo === 'dividir'
                  ? 'Menos que o saldo da etapa — o resto continua no lote atual.'
                  : 'Pode mover só parte: o resto fica onde está.'
              }
            >
              <Input
                type="number"
                min={1}
                max={acao.cartao.quantidade}
                required
                value={form.quantidade}
                onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })}
              />
            </Campo>

            {acao.tipo === 'avancar' && destinoDefineCor && (
              <Campo
                rotulo="Esmalte"
                dica={
                  acao.cartao.cor
                    ? 'Este lote já tem cor definida.'
                    : 'Se você esmaltar só parte, o sistema separa um lote novo com esta cor.'
                }
              >
                <Select
                  required
                  disabled={Boolean(acao.cartao.cor)}
                  value={form.corId}
                  onChange={(e) => setForm({ ...form, corId: e.target.value })}
                >
                  <option value="">— escolha o esmalte —</option>
                  {cores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </Campo>
            )}

            {acao.tipo === 'avancar' && (
              <Campo rotulo="Quem fez">
                <Select value={form.responsavelId} onChange={(e) => setForm({ ...form, responsavelId: e.target.value })}>
                  <option value="">— responsável padrão da etapa —</option>
                  {responsaveis.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </Select>
              </Campo>
            )}

            <Campo
              rotulo={acao.tipo === 'perda' ? 'O que aconteceu' : 'Observação'}
              dica={acao.tipo === 'perda' ? 'Esse texto vira o histórico da perda — vale ser específico.' : undefined}
            >
              <Textarea
                rows={2}
                maxLength={300}
                required={acao.tipo === 'perda'}
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              />
            </Campo>

            <div className="flex flex-wrap justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setAcao(null)} disabled={enviando}>
                Cancelar
              </Botao>
              <Botao type="submit" variante={acao.tipo === 'perda' ? 'perigo' : 'primario'} disabled={enviando}>
                {enviando ? 'Registrando…' : 'Confirmar'}
              </Botao>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}

export const EtiquetaTipo = Etiqueta
