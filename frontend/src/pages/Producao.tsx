import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, BadgeMinus, Boxes, Plus, Scissors } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { avisar } from '../components/Toaster'
import { plural } from '../lib/format'
import { enviarComFila } from '../lib/filaOffline'
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

type Acao = 'avancar' | 'perda' | 'segunda' | 'dividir'

const CORES_TIPO: Record<string, string> = {
  producao: '#BBA58C',
  secagem: '#A9CBDD',
  queima: '#C4703B',
  estoque: '#B8963E',
  final: '#3E5C4B',
}

/*
 * O MAPA DO FLUXO.
 *
 * O quadro tem 7 etapas e a tela comporta 4. As três que sobravam eram
 * Esmaltação, 2ª Queima e Pronto — ou seja, sumia exatamente a metade que já
 * tem cor e está perto de virar venda. Alargar coluna não resolve: com 11
 * etapas cadastradas o problema volta.
 *
 * A resposta é separar as duas perguntas que o quadro respondia juntas e mal:
 * "como está o ateliê inteiro" (esta faixa, sempre visível, sempre completa) e
 * "o que tem nesta etapa" (as colunas, que podem rolar à vontade). Clicar numa
 * etapa da faixa leva o quadro até ela.
 */
function MapaDoFluxo({
  colunas,
  aoEscolher,
}: {
  colunas: Coluna[]
  aoEscolher: (etapaId: string) => void
}) {
  const maior = Math.max(1, ...colunas.map((c) => c.total))
  return (
    // sticky na viewport: rolando a página atrás de uma coluna comprida, o
    // total das outras etapas continua à vista
    <div className="sticky top-14 z-20 mb-4 overflow-x-auto rounded-2xl border border-borda bg-superficie/95 p-1.5 shadow-baixa backdrop-blur-md">
      <ol className="flex min-w-max items-stretch gap-1">
        {colunas.map((coluna, i) => {
          const cor = CORES_TIPO[coluna.etapa.tipo] ?? '#BBA58C'
          const vazia = coluna.total === 0
          return (
            <li key={coluna.etapa.id} className="flex items-stretch">
              {i > 0 && (
                <span aria-hidden className="w-3 self-center border-t border-dashed border-borda" />
              )}
              <button
                onClick={() => aoEscolher(coluna.etapa.id)}
                className="group relative min-w-[7.5rem] flex-1 rounded-xl px-3 py-2 text-left transition-colors hover:bg-superficie-2"
                title={`Ir para ${coluna.etapa.nome}`}
              >
                <span className="flex items-baseline gap-1.5">
                  <span
                    className={`font-titulo text-xl leading-none ${vazia ? 'text-tinta-fraca/50' : 'text-tinta'}`}
                  >
                    {coluna.total}
                  </span>
                  {coluna.etapa.defineCor && (
                    <span className="text-[10px] uppercase tracking-wider text-ouro">cor</span>
                  )}
                  {coluna.etapa.estoqueIntermediario && (
                    <span className="text-[10px] uppercase tracking-wider text-verde">pulmão</span>
                  )}
                </span>
                <span className="mt-1 block truncate text-xs text-tinta-fraca">{coluna.etapa.nome}</span>
                {/* a barra dá a proporção entre etapas sem precisar comparar números */}
                <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-superficie-2">
                  <span
                    className="block h-full rounded-full transition-all duration-500"
                    style={{ width: `${(coluna.total / maior) * 100}%`, backgroundColor: cor }}
                  />
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
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

  // rolagem horizontal do quadro: os degradês só existem do lado que ainda tem
  // quadro, então precisam saber onde o trilho está
  const trilho = useRef<HTMLDivElement>(null)
  const [temMaisAEsquerda, setTemMaisAEsquerda] = useState(false)
  const [temMaisADireita, setTemMaisADireita] = useState(false)

  const medirRolagem = useCallback(() => {
    const el = trilho.current
    if (!el) return
    setTemMaisAEsquerda(el.scrollLeft > 4)
    // -4 de folga: zoom do navegador deixa a conta com resto e o degradê
    // ficava aceso para sempre no fim do trilho
    setTemMaisADireita(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  useEffect(() => {
    medirRolagem()
    window.addEventListener('resize', medirRolagem)
    return () => window.removeEventListener('resize', medirRolagem)
  }, [medirRolagem, colunas])

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
      // as três escritas de produção passam pela fila: no ateliê o sinal cai, e
      // registro perdido é o que faz o oleiro parar de usar o sistema
      if (acao.tipo === 'avancar') {
        const r = await enviarComFila(
          'post',
          `/lotes/${acao.cartao.id}/avancar`,
          {
            etapaOrigemId: acao.etapaId,
            etapaDestinoId: form.etapaDestinoId,
            quantidade: form.quantidade,
            corId: form.corId || null,
            responsavelId: form.responsavelId || null,
            motivo: form.motivo || null,
          },
          `Mover ${form.quantidade} de ${acao.cartao.peca.nome} (${acao.cartao.codigo})`,
        )
        const criado = (r.dados as { loteCriado?: { codigo: string } } | undefined)?.loteCriado
        avisar.ok(
          r.enfileirado
            ? 'Sem conexão — guardado. Sobe sozinho quando a rede voltar.'
            : criado
              ? `Movido. Parte do lote virou ${criado.codigo} com a cor escolhida.`
              : 'Movido.',
        )
      } else if (acao.tipo === 'perda' || acao.tipo === 'segunda') {
        const r = await enviarComFila(
          'post',
          `/lotes/${acao.cartao.id}/${acao.tipo}`,
          { etapaId: acao.etapaId, quantidade: form.quantidade, motivo: form.motivo },
          `${acao.tipo === 'perda' ? 'Perda' : 'Segunda'} de ${form.quantidade} em ${acao.cartao.codigo}`,
        )
        avisar.ok(
          r.enfileirado
            ? 'Sem conexão — guardado. Sobe sozinho quando a rede voltar.'
            : acao.tipo === 'perda'
              ? 'Perda registrada.'
              : 'Separado como segunda qualidade.',
        )
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

  const irParaEtapa = (etapaId: string) => {
    const alvo = trilho.current?.querySelector<HTMLElement>(`[data-etapa="${etapaId}"]`)
    alvo?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Produção"
        descricao="Onde cada lote está agora. Toque no cartão para mover, perder ou dividir."
        acoes={
          <>
            <div className="min-w-0 sm:w-52">
              <Select value={filtroPeca} onChange={(e) => setFiltroPeca(e.target.value)}>
                <option value="">Todas as peças</option>
                {pecas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-0 sm:w-52">
              <Select value={filtroCor} onChange={(e) => setFiltroCor(e.target.value)}>
                <option value="">Todos os esmaltes</option>
                {cores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </div>
            <Botao onClick={() => setNovoAberto(true)} className="col-span-2 justify-center sm:col-span-1">
              <Plus size={16} /> Novo lote
            </Botao>
          </>
        }
      />

      {vazio ? (
        <Vazio
          icone={<Boxes size={22} />}
          titulo="O ateliê está sem lote aberto"
          descricao="Cada lote é um conjunto de peças andando junto pelo roteiro. Abra um e ele aparece aqui, coluna por coluna, até chegar em Pronto."
          acao={<Botao onClick={() => setNovoAberto(true)}>Abrir o primeiro lote</Botao>}
        />
      ) : (
        <>
          <MapaDoFluxo colunas={colunas} aoEscolher={irParaEtapa} />

          <div className="relative -mx-4 sm:-mx-6">
            {/* degradês nas duas bordas: aparecem só do lado para onde ainda
                há quadro, então também dizem *onde* você está no fluxo */}
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-y-0 left-0 z-20 w-10 bg-gradient-to-r from-fundo to-transparent transition-opacity duration-200 ${
                temMaisAEsquerda ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-gradient-to-l from-fundo to-transparent transition-opacity duration-200 ${
                temMaisADireita ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <div
              ref={trilho}
              onScroll={medirRolagem}
              className="snap-x snap-proximity overflow-x-auto px-4 pb-3 sm:px-6"
            >
              <div className="flex min-w-max gap-3">
            {colunas.map((coluna) => (
              <section
                key={coluna.etapa.id}
                data-etapa={coluna.etapa.id}
                className="w-[16rem] shrink-0 snap-start"
              >
                <header
                  // top-0, não top-14: o `overflow-x` faz deste bloco o próprio
                  // scrollport, então qualquer offset empurra o cabeçalho para
                  // cima do primeiro cartão em vez de descolá-lo do topo da
                  // página. Quem fica preso na viewport é o mapa do fluxo.
                  className="sticky top-0 z-10 mb-2.5 flex min-h-[2.75rem] items-center justify-between gap-2 rounded-xl px-3.5 py-2 backdrop-blur-md"
                  style={{ backgroundColor: `${CORES_TIPO[coluna.etapa.tipo] ?? '#BBA58C'}24` }}
                >
                  <h2 className="truncate text-sm font-semibold text-tinta">{coluna.etapa.nome}</h2>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {coluna.etapa.defineCor && (
                      <span
                        title="Etapa em que a cor é escolhida"
                        className="rounded-md bg-ouro/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ouro"
                      >
                        cor
                      </span>
                    )}
                    {coluna.etapa.estoqueIntermediario && (
                      <span
                        title="Estoque neutro: atende qualquer cor que sair na frente"
                        className="rounded-md bg-verde/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-verde"
                      >
                        pulmão
                      </span>
                    )}
                    <span className="text-sm font-semibold text-tinta">{coluna.total}</span>
                  </span>
                </header>

                <div className="flex flex-col gap-2">
                  {coluna.cartoes.map((cartao) => (
                    <article
                      key={cartao.id}
                      className="anima-surgir rounded-2xl border border-borda bg-superficie p-3.5 shadow-baixa transition-all duration-200 hover:-translate-y-0.5 hover:border-marca-clara hover:shadow-media"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-tinta">{cartao.peca.nome}</p>
                          <p className="text-xs text-tinta-fraca">{cartao.codigo}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-marca/15 px-2.5 py-0.5 font-titulo text-base leading-6 text-tinta">
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
                          onClick={() => abrirAcao('segunda', cartao, coluna.etapa.id)}
                          title="Peça com defeito pequeno que ainda vende — não é perda"
                          className="inline-flex items-center gap-1 rounded-lg border border-borda px-2 py-1 text-xs text-tinta hover:bg-superficie-2"
                        >
                          <BadgeMinus size={13} /> Segunda
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
          </div>
        </>
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
              : acao?.tipo === 'segunda'
                ? `Separar segunda qualidade de ${acao?.cartao.codigo}`
                : `Dividir ${acao?.cartao.codigo}`
        }
        largura="max-w-lg"
      >
        {acao && (
          <form onSubmit={enviar} className="flex flex-col gap-4">
            <p className="text-sm text-tinta-fraca">
              {acao.cartao.peca.nome} — {plural(acao.cartao.quantidade, 'peça')} nesta etapa.
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
              rotulo={
                acao.tipo === 'perda'
                  ? 'O que aconteceu'
                  : acao.tipo === 'segunda'
                    ? 'Qual o defeito'
                    : 'Observação'
              }
              dica={
                acao.tipo === 'perda'
                  ? 'Esse texto vira o histórico da perda — vale ser específico.'
                  : acao.tipo === 'segunda'
                    ? 'Segunda qualidade continua sendo estoque: vende com desconto e NÃO entra na taxa de perda.'
                    : undefined
              }
            >
              <Textarea
                rows={2}
                maxLength={300}
                required={acao.tipo === 'perda' || acao.tipo === 'segunda'}
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
