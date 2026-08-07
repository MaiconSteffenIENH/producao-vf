import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, BadgeMinus, Boxes, Plus, Scissors, Trash2 } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { avisar } from '../components/Toaster'
import { dataBr, hojeNoAtelie, plural } from '../lib/format'
import { enviarComFila } from '../lib/filaOffline'
import { MOTIVOS_PERDA, ajudaDoMotivo } from '../lib/motivos-perda'
import { useArrastar } from '../lib/useArrastar'
import { ConfirmarExclusaoLote } from '../components/ConfirmarExclusaoLote'
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
  /** o que quem abriu o lote escreveu — estava sendo salvo e não aparecia em lugar nenhum */
  observacao: string | null
  iniciadoEm: string
  proximaEtapaId: string | null
  responsavelSugeridoId: string | null
  peca: { id: string; nome: string; categoria: { nome: string } }
  cor: Cor | null
  loteOrigem: { id: string; codigo: string } | null
  /** etapas do roteiro desta peça, tirando a atual — para onde o arrasto pode ir */
  destinosPermitidos: string[]
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
  refFaixa,
}: {
  colunas: Coluna[]
  aoEscolher: (etapaId: string) => void
  /** a altura desta faixa é o teto por onde o quadro pode subir */
  refFaixa: React.Ref<HTMLDivElement>
}) {
  const maior = Math.max(1, ...colunas.map((c) => c.total))
  return (
    // sticky na viewport: rolando a página atrás de uma coluna comprida, o
    // total das outras etapas continua à vista
    <div
      ref={refFaixa}
      className="sticky top-14 z-20 mb-4 overflow-x-auto rounded-2xl border border-borda bg-superficie/95 p-1.5 shadow-baixa backdrop-blur-md"
    >
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
                    <span className="text-[10px] uppercase tracking-wider text-verde">estoque</span>
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

  const [paraApagar, setParaApagar] = useState<string | null>(null)
  const [novoAberto, setNovoAberto] = useState(false)
  /*
   * A data já vem preenchida com hoje.
   *
   * O caso comum continua sendo um clique: quem abre o lote no dia não toca no
   * campo. O campo existe para o outro caso, que é frequente no ateliê — o
   * oleiro torneia na segunda e o lote só é lançado na quarta. Sem ele, esses
   * dois dias somem da conta de "parado há X dias", que é o que ordena a fila
   * do forno.
   */
  const hojeTexto = hojeNoAtelie
  const [novo, setNovo] = useState({ pecaId: '', quantidade: 20, observacao: '', iniciadoEm: hojeTexto() })

  // rolagem horizontal do quadro: os degradês só existem do lado que ainda tem
  // quadro, então precisam saber onde o trilho está
  const trilho = useRef<HTMLDivElement>(null)
  const faixa = useRef<HTMLDivElement>(null)
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
  const [form, setForm] = useState({
    quantidade: 0,
    etapaDestinoId: '',
    corId: '',
    responsavelId: '',
    motivo: '',
    motivoTipo: '',
  })
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

  const abrirAcao = (tipo: Acao, cartao: Cartao, etapaId: string, destinoId?: string) => {
    setAcao({ tipo, cartao, etapaId })
    setForm({
      quantidade: cartao.quantidade,
      // arrastar já escolhe o destino; clicar em "Mover" propõe a próxima do roteiro
      etapaDestinoId: destinoId ?? cartao.proximaEtapaId ?? '',
      corId: cartao.cor?.id ?? '',
      responsavelId: cartao.responsavelSugeridoId ?? '',
      motivo: '',
      // nunca vem preenchido: motivo herdado da perda anterior seria diagnóstico
      // por descuido, e é justamente a soma por motivo que ficaria mentindo
      motivoTipo: '',
    })
  }

  /*
   * ARRASTAR O CARTÃO ATÉ A COLUNA.
   *
   * Soltar NÃO grava direto: abre a confirmação com destino e quantidade cheia
   * já preenchidos, e um clique fecha. Duas razões, as duas do domínio:
   *
   * - O quadro fica aberto o dia todo no ateliê, em tela sensível ao toque. Um
   *   arrasto sem querer viraria movimento gravado, e no livro-razão isso não
   *   se apaga — se corrige com estorno, que suja o histórico para sempre.
   * - Arrastar sozinho não resolve os dois casos mais comuns: escolher o
   *   esmalte quando a etapa define a cor, e mover só parte do lote. Abrindo o
   *   mesmo modal, os três caminhos terminam no mesmo lugar.
   */
  const { estado: arrasto, pegar } = useArrastar<Cartao & { etapaOrigemId: string }>({
    destinosDe: (c) => c.destinosPermitidos ?? [],
    aoSoltar: (c, etapaDestinoId) => abrirAcao('avancar', c, c.etapaOrigemId, etapaDestinoId),
    // o mesmo trilho que os degradês medem: chegando perto da borda, ele anda
    // sozinho, e é isso que torna o arrasto utilizável num celular de 390px
    trilho,
  })

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
          {
            etapaId: acao.etapaId,
            quantidade: form.quantidade,
            motivo: form.motivo,
            /*
             * O motivo tipado viaja no corpo GUARDADO pela fila, e não só na
             * requisição: sem ele aqui, a perda registrada sem sinal subiria
             * dias depois sem diagnóstico nenhum — e no livro-razão isso não se
             * edita depois. Segunda qualidade não é perda e não recebe motivo.
             */
            ...(acao.tipo === 'perda' ? { motivoTipo: form.motivoTipo } : {}),
          },
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
      setNovo({ pecaId: '', quantidade: 20, observacao: '', iniciadoEm: hojeTexto() })
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para abrir o lote.'))
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) return <Carregando />

  const vazio = colunas.every((c) => c.cartoes.length === 0)

  /*
   * IR ATÉ UMA ETAPA, sem embaralhar a tela.
   *
   * Era `scrollIntoView({ block: 'nearest', inline: 'start' })`, e o problema
   * é que ele rola TODOS os ancestrais roláveis — inclusive a página. Como a
   * coluna é alta (são os cartões dela), o navegador subia a página até o topo
   * da coluna, e o cabeçalho "SECAGEM 112" ia parar EMBAIXO da faixa do fluxo,
   * que é `sticky`. O que sobrava na tela eram os cartões soltos, com o nome da
   * etapa escondido e as colunas vizinhas mostrando "vazio" — exatamente a
   * bagunça da imagem que o Maicon mandou.
   *
   * Agora são dois movimentos independentes e explícitos:
   *
   *   1. o trilho rola na HORIZONTAL até a coluna, e só ele;
   *   2. a página sobe na VERTICAL apenas o suficiente para o cabeçalho da
   *      coluna encostar logo abaixo da faixa — e só se ele estiver escondido.
   *
   * O resultado é o nome da etapa em cima e os cartões embaixo, que é como a
   * tela precisa ficar para alguém saber o que está olhando.
   */
  const irParaEtapa = (etapaId: string) => {
    const pista = trilho.current
    const alvo = pista?.querySelector<HTMLElement>(`[data-etapa="${etapaId}"]`)
    if (!pista || !alvo) return

    /*
     * A folga é LIDA do elemento, não chutada.
     *
     * O trilho é `px-4 sm:px-6`: cravar 16 aqui deixava a primeira coluna com
     * `scrollLeft = 8` no desktop, o que acende o degradê de "tem mais quadro à
     * esquerda" sobre um quadro que já está no começo — e briga com o
     * `snap-start`, cujo ponto de encaixe é o zero.
     */
    const folga = parseFloat(getComputedStyle(pista).paddingLeft) || 0
    // rects em vez de offsetLeft: o offsetParent aqui é a div de degradês, e
    // depender dela quebraria em silêncio se o wrapper mudasse
    const desloc = alvo.getBoundingClientRect().left - pista.getBoundingClientRect().left
    pista.scrollBy({ left: desloc - folga, behavior: 'smooth' })

    const limite = faixa.current?.getBoundingClientRect().bottom ?? 0
    const topoDoQuadro = pista.getBoundingClientRect().top
    const respiro = 16
    if (topoDoQuadro < limite + respiro) {
      window.scrollBy({ top: topoDoQuadro - limite - respiro, behavior: 'smooth' })
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Produção"
        descricao="Onde cada lote está agora. Arraste o cartão até a etapa, ou use os botões dele para mover, perder ou dividir."
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
          <MapaDoFluxo colunas={colunas} aoEscolher={irParaEtapa} refFaixa={faixa} />

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
                // o alvo é lido do DOM na hora de soltar (elementsFromPoint), e
                // não de uma lista de retângulos em estado — assim o quadro pode
                // rolar no meio do arrasto sem as áreas saírem do lugar
                data-alvo-arrasto={coluna.etapa.id}
                className={`w-[16rem] shrink-0 snap-start rounded-2xl transition-colors duration-150 ${
                  arrasto.item
                    ? arrasto.alvo === coluna.etapa.id
                      ? 'bg-marca/12 outline-2 outline-dashed outline-marca'
                      : arrasto.item.destinosPermitidos?.includes(coluna.etapa.id)
                        ? 'bg-marca/5 outline-2 outline-dashed outline-marca-clara'
                        : // fora do roteiro da peça: apagada, para nem tentar
                          'opacity-40'
                    : ''
                }`}
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
                        estoque
                      </span>
                    )}
                    <span className="text-sm font-semibold text-tinta">{coluna.total}</span>
                  </span>
                </header>

                <div className="flex flex-col gap-2">
                  {/*
                    A PRÉVIA — o encaixe que mostra onde o cartão vai parar.
                    Fica no TOPO da coluna de propósito: cartão dentro de etapa
                    não tem ordem nenhuma (o saldo é uma soma), então "no fim da
                    fila" seria uma ordem inventada. No topo ela aparece logo
                    abaixo do cabeçalho, onde o olho já está.
                  */}
                  {arrasto.alvo === coluna.etapa.id && arrasto.item && (
                    <div className="anima-aparecer flex flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-dashed border-marca bg-marca/10 px-3.5 py-5 text-center">
                      <span className="text-sm font-medium text-marca-escura">
                        {arrasto.item.peca.nome}
                      </span>
                      <span className="text-xs text-marca-escura">
                        {plural(arrasto.item.quantidade, 'peça')} entram aqui
                      </span>
                    </div>
                  )}

                  {coluna.cartoes.map((cartao) => (
                    <article
                      key={cartao.id}
                      {...pegar({ ...cartao, etapaOrigemId: coluna.etapa.id })}
                      className={`anima-surgir rounded-2xl border border-borda bg-superficie p-3.5 shadow-baixa transition-all duration-200 ${
                        arrasto.item?.id === cartao.id && arrasto.item?.etapaOrigemId === coluna.etapa.id
                          ? // o original vira contorno vazado: mostra de onde saiu
                            'border-dashed opacity-35'
                          : 'cursor-grab hover:-translate-y-0.5 hover:border-marca-clara hover:shadow-media active:cursor-grabbing'
                      }`}
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

                      <p className="mt-1 text-[11px] text-tinta-fraca">
                        aberto em {dataBr(cartao.iniciadoEm)}
                      </p>

                      {/*
                        A OBSERVAÇÃO, ONDE ELA SERVE PARA ALGUMA COISA.

                        O texto era gravado desde sempre e não aparecia em tela
                        nenhuma — nem no cartão, nem no detalhe. Quem escrevia
                        "argila da leva nova, conferir retração" tinha toda razão
                        de achar que o campo não salvava.

                        Fica no cartão, e não só no detalhe, porque quem precisa
                        dela é quem está com a peça na mão: ler exige não abrir
                        nada. `line-clamp-2` corta o texto longo sem esticar a
                        coluna, e o `title` mostra o resto ao passar o mouse.
                      */}
                      {cartao.observacao && (
                        <p
                          className="mt-1.5 line-clamp-2 rounded-lg bg-superficie-2 px-2 py-1 text-[11px] leading-snug text-tinta"
                          title={cartao.observacao}
                        >
                          {cartao.observacao}
                        </p>
                      )}

                      {/*
                        GRADE DE DUAS COLUNAS, e não `flex-wrap`.

                        Com flex, cada botão fica do tamanho da própria palavra:
                        "Mover" curto, "Segunda" comprido, e as bordas de baixo
                        nunca se alinham — vira escada. Na grade a largura é da
                        COLUNA, então os quatro ficam idênticos e o ícone de
                        cada um cai sempre na mesma distância da borda.

                        `justify-start` com o ícone antes do texto mantém os
                        quatro ícones numa coluna só; centralizar o conteúdo
                        deixaria cada ícone num lugar diferente, que é
                        exatamente a bagunça que a grade veio resolver.

                        Apagar fica fora do bloco, na largura toda: é o único
                        que não tem volta, e misturá-lo aos outros três
                        convidaria ao toque errado numa tela de dedo.
                      */}
                      <div className="mt-3 grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => abrirAcao('avancar', cartao, coluna.etapa.id)}
                          className="inline-flex items-center justify-start gap-1.5 rounded-lg bg-marca px-2.5 py-1.5 text-xs font-medium text-contraste hover:bg-marca-escura"
                        >
                          <ArrowRight size={13} className="shrink-0" /> Mover
                        </button>
                        <button
                          onClick={() => abrirAcao('perda', cartao, coluna.etapa.id)}
                          className="inline-flex items-center justify-start gap-1.5 rounded-lg border border-borda px-2.5 py-1.5 text-xs text-tinta hover:bg-superficie-2"
                        >
                          <AlertTriangle size={13} className="shrink-0" /> Perda
                        </button>
                        <button
                          onClick={() => abrirAcao('segunda', cartao, coluna.etapa.id)}
                          title="Peça com defeito pequeno que ainda vende — não é perda"
                          className="inline-flex items-center justify-start gap-1.5 rounded-lg border border-borda px-2.5 py-1.5 text-xs text-tinta hover:bg-superficie-2"
                        >
                          <BadgeMinus size={13} className="shrink-0" /> Segunda
                        </button>
                        <button
                          onClick={() => abrirAcao('dividir', cartao, coluna.etapa.id)}
                          className="inline-flex items-center justify-start gap-1.5 rounded-lg border border-borda px-2.5 py-1.5 text-xs text-tinta hover:bg-superficie-2"
                        >
                          <Scissors size={13} className="shrink-0" /> Dividir
                        </button>
                        <button
                          onClick={() => setParaApagar(cartao.id)}
                          title="Lote aberto por engano — apaga de vez, e nada dele vira perda"
                          aria-label={`Apagar lote ${cartao.codigo}`}
                          className="col-span-2 inline-flex items-center justify-start gap-1.5 rounded-lg border border-borda px-2.5 py-1.5 text-xs text-tinta-fraca hover:border-perigo/40 hover:bg-perigo/5 hover:text-perigo"
                        >
                          <Trash2 size={13} className="shrink-0" /> Apagar
                        </button>
                      </div>
                    </article>
                  ))}
                  {coluna.cartoes.length === 0 && !(arrasto.alvo === coluna.etapa.id) && (
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

      <p className="mt-6 text-xs leading-relaxed text-tinta-fraca">
        Arrastar acende só as etapas do roteiro daquela peça — as outras apagam, porque o sistema recusaria o
        movimento de qualquer jeito. Soltar não grava direto: abre a confirmação já preenchida, e um clique
        fecha. É de propósito. O quadro fica aberto o dia inteiro em tela de toque, e no livro-razão um
        movimento gravado sem querer não se apaga — se corrige com estorno, que fica no histórico para sempre.
      </p>

      {/*
        O CARTÃO FANTASMA que segue o dedo.
        `position: fixed` + `pointer-events-none`: ele não pode interceptar o
        elementsFromPoint que descobre a coluna sob o ponteiro, senão o alvo
        seria sempre o próprio fantasma.
      */}
      {arrasto.item && (
        <div
          aria-hidden
          // deslocado do ponteiro, e não centrado nele: centrado, o fantasma
          // tapava justamente a prévia que ele deveria ajudar a enxergar
          className="pointer-events-none fixed z-[80] w-[13rem] rotate-2 rounded-2xl border border-marca bg-superficie p-3 opacity-95 shadow-alta"
          style={{ left: arrasto.x + 18, top: arrasto.y + 14 }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-tinta">{arrasto.item.peca.nome}</p>
              <p className="text-xs text-tinta-fraca">{arrasto.item.codigo}</p>
            </div>
            <span className="shrink-0 rounded-full bg-marca/15 px-2.5 py-0.5 font-titulo text-base leading-6 text-tinta">
              {arrasto.item.quantidade}
            </span>
          </div>
          {arrasto.item.cor ? (
            <div className="mt-2">
              <ChipCor
                nome={arrasto.item.cor.nome}
                hex={arrasto.item.cor.hex}
                amostraUrl={arrasto.item.cor.amostraUrl}
                malhado={arrasto.item.cor.malhado}
                tamanho={14}
              />
            </div>
          ) : (
            <p className="mt-2 text-xs text-tinta-fraca">sem cor definida</p>
          )}
          <p className="mt-2 text-[11px] text-marca">
            {arrasto.alvo ? 'solte para mover' : 'arraste até uma etapa do roteiro'}
          </p>
        </div>
      )}

      {/* ── novo lote ─────────────────────────────── */}
      <Modal
        aberto={novoAberto}
        aoFechar={() => setNovoAberto(false)}
        titulo="Novo lote"
        largura="max-w-lg"
        fecharClicandoFora={false}
      >
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
          <Campo
            rotulo="Aberto em"
            dica="Já vem hoje. Mude se o lote começou antes — a espera conta a partir daqui."
          >
            <Input
              type="date"
              required
              max={hojeTexto()}
              value={novo.iniciadoEm}
              onChange={(e) => setNovo({ ...novo, iniciadoEm: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Observação" dica="Aparece no cartão do lote, no quadro.">
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
        fecharClicandoFora={false}
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

            {/*
              O MOTIVO VEM ANTES DO TEXTO, e é lista fixa.
              Antes porque classificar primeiro muda o que se escreve depois: o
              texto deixa de repetir "trincou" e vira o detalhe do caso ("saiu da
              estufa da parede da janela"). E é lista porque texto livre não soma
              — a perda já entrava na conta do quanto produzir e no custo da
              peça, só que sem dizer por quê.
              O modal de segunda qualidade NÃO tem este campo: segunda não é
              perda, é estoque que vende com desconto.
            */}
            {acao.tipo === 'perda' && (
              <Campo
                rotulo="Motivo da perda"
                dica={
                  ajudaDoMotivo(form.motivoTipo) ??
                  'Escolher da lista é o que permite somar depois: "38% das perdas do Bule são trinca na secagem".'
                }
              >
                <Select
                  required
                  value={form.motivoTipo}
                  onChange={(e) => setForm({ ...form, motivoTipo: e.target.value })}
                >
                  <option value="">— escolha o motivo —</option>
                  {MOTIVOS_PERDA.map((m) => (
                    <option key={m.valor} value={m.valor}>
                      {m.rotulo}
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
                  ? 'O motivo acima agrupa; este texto é o que explica o caso para quem abrir o lote daqui a três meses.'
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

      <ConfirmarExclusaoLote
        loteId={paraApagar}
        aoFechar={() => setParaApagar(null)}
        aoApagar={() => void recarregar()}
      />
    </>
  )
}

export const EtiquetaTipo = Etiqueta
