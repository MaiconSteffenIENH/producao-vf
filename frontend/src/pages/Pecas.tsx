import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2, X } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
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
  InputNumero,
  Modal,
  Select,
  SelecaoBuscavel,
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
  /** continua vindo da API e sendo editado no Estoque de biscoito; o cadastro só mostra */
  qtdMinimaBiscoito: number
  /** continua vindo da API e sendo editado na tela de Preços; o cadastro não mexe */
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
  const [paraDuplicar, setParaDuplicar] = useState<Peca | null>(null)
  const [nomeDaCopia, setNomeDaCopia] = useState('')
  const [duplicando, setDuplicando] = useState(false)

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

  /*
   * Seleciona o nome sugerido QUANDO ele chega, não quando a janela abre.
   *
   * A sugestão vem do servidor, então no `autoFocus` o campo ainda está vazio.
   * Sem isto, quem quer trocar o nome inteiro — o caso comum — precisa apagar
   * "BOWL (CÓPIA)" letra por letra antes de escrever.
   *
   * A trava é o que impede a seleção de voltar a cada tecla: selecionar de novo
   * no meio da digitação faria a próxima letra apagar o que já foi escrito.
   */
  const campoNomeDaCopia = useRef<HTMLInputElement>(null)
  const jaSelecionouONome = useRef(false)
  useEffect(() => {
    if (!paraDuplicar) {
      jaSelecionouONome.current = false
      return
    }
    if (!nomeDaCopia || jaSelecionouONome.current) return
    jaSelecionouONome.current = true
    campoNomeDaCopia.current?.select()
  }, [paraDuplicar, nomeDaCopia])

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

  /*
   * DUPLICAR PASSOU A PERGUNTAR O NOME.
   *
   * Antes ela criava "BOWL (CÓPIA)" e pronto — e ninguém quer uma peça chamada
   * assim, então toda duplicação virava duas operações: copiar e depois abrir
   * a edição para renomear. O nome sugerido vem do servidor, que é quem sabe
   * quais já existem.
   *
   * A janela abre ANTES de a sugestão chegar, de propósito: o backend do plano
   * gratuito hiberna e a primeira chamada do dia pode levar um minuto — segurar
   * a janela até lá pareceria que o botão não funcionou. A seleção do texto
   * fica por conta do efeito abaixo, porque no instante do `autoFocus` o campo
   * ainda está vazio e não há o que selecionar.
   */
  const abrirDuplicacao = async (peca: Peca) => {
    setParaDuplicar(peca)
    setNomeDaCopia('')
    try {
      const { data } = await api.get(`/pecas/${peca.id}/nome-de-copia`)
      setNomeDaCopia(data.nome)
    } catch (erro) {
      // sugestão é conveniência, não requisito: o campo continua editável
      setNomeDaCopia(`${peca.nome} (CÓPIA)`)
      avisar.erro(mensagemDoErro(erro, 'Não deu para sugerir um nome — confira antes de salvar.'))
    }
  }

  const duplicar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!paraDuplicar) return
    setDuplicando(true)
    try {
      await api.post(`/pecas/${paraDuplicar.id}/duplicar`, { nome: nomeDaCopia })
      avisar.ok('Cópia criada como inativa — revise e ative.')
      setParaDuplicar(null)
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para duplicar.'))
    } finally {
      setDuplicando(false)
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
              <SelecaoBuscavel
                valor={filtroCategoria}
                aoEscolher={setFiltroCategoria}
                limpavel
                placeholder="Todas as categorias"
                vazio="Nenhuma categoria com esse nome."
                opcoes={categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))}
              />
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
                {/* link e não texto: o número deixou de ser editável aqui, e
                    campo que some sem dizer para onde foi é indistinguível de
                    campo apagado */}
                <Link
                  to="/estoque/biscoito"
                  className="underline decoration-borda underline-offset-4 hover:decoration-marca"
                  title="O mínimo em biscoito é definido no Estoque de biscoito"
                >
                  Mínimo biscoito: <strong>{peca.qtdMinimaBiscoito}</strong>
                </Link>
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
                  onClick={() => void abrirDuplicacao(peca)}
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
              <SelecaoBuscavel
                required
                valor={form.categoriaId}
                aoEscolher={(v) => setForm({ ...form, categoriaId: v })}
                vazio="Nenhuma categoria com esse nome."
                opcoes={categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))}
              />
            </Campo>
            <Campo rotulo="Responsável inicial">
              <SelecaoBuscavel
                valor={form.responsavelInicialId}
                aoEscolher={(v) => setForm({ ...form, responsavelInicialId: v })}
                limpavel
                placeholder="— nenhum —"
                vazio="Ninguém com esse nome."
                opcoes={responsaveis.map((r) => ({ valor: r.id, rotulo: r.nome }))}
              />
            </Campo>
            <Campo rotulo="Tempo médio (dias)" dica="Do início ao pronto. A loja anuncia ~30 dias.">
              <InputNumero
                min={1}
                max={365}
                valor={form.tempoMedioDias}
                aoMudar={(n) => setForm({ ...form, tempoMedioDias: n ?? 0 })}
              />
            </Campo>
            <Campo rotulo="Mínimo desejado pronto">
              <InputNumero
                min={0}
                valor={form.qtdMinimaDesejada}
                aoMudar={(n) => setForm({ ...form, qtdMinimaDesejada: n ?? 0 })}
              />
            </Campo>
            {/*
              O MÍNIMO EM BISCOITO SAIU DAQUI.
              Ele não é característica da peça, é decisão de estoque: quanto
              pulmão esta peça precisa se decide olhando o que está parado e o
              que está vendendo — coisa que esta tela não mostra. Agora ele é
              editado na tela de Estoque de biscoito, onde os dois números
              aparecem lado a lado.
              A coluna continua no banco e continua alimentando o alerta do
              planejamento. Por isso o cartão da lista ainda mostra o valor,
              com link para onde ele se muda: tirar da tela sem dizer para onde
              foi é como apagar.
            */}
            {/*
              O CADASTRO DE PEÇA NÃO PEDE MAIS DINHEIRO.
              Quem cadastra peça é a Gabi, e ela cadastra o que o ateliê PRODUZ:
              nome, roteiro, esmaltes possíveis e mínimos. Preço é outra
              conversa, com outro dono e outra periodicidade — e um campo de R$
              no meio do cadastro fazia parecer obrigatório definir preço para
              conseguir abrir um lote, o que nunca foi verdade.
              A coluna continua no banco, e a tela de Preços continua sendo o
              lugar de mexer nela. Se o ateliê não precisa de preço agora, o
              caminho é desligar o módulo em Ajustes — reversível, ao contrário
              de apagar.
            */}
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
                <p className="text-xs text-tinta-fraca">
                  A ordem aqui é a ordem real no ateliê. Os <strong>dias</strong> de cada etapa são o que
                  o sistema usa para prever quando o lote fica pronto, avisar quando o prazo de uma
                  encomenda não fecha e calcular quanto tempo leva para repor uma peça.
                </p>
              </div>
              <Botao type="button" variante="secundario" onClick={adicionarEtapa}>
                <Plus size={14} /> Adicionar etapa
              </Botao>
            </div>

            {roteiro.length === 0 && (
              <p className="py-2 text-sm text-tinta-fraca">Nenhuma etapa ainda. Sem roteiro a peça não vira lote.</p>
            )}

            {/*
              CABEÇALHO DE COLUNA. O campo de dias era um número solto sem
              rótulo nenhum, e o Maicon perguntou o que ele significava — o que
              é resposta suficiente sobre a tela. Ele não é decorativo: alimenta
              a previsão do planejamento, o aviso de prazo apertado da encomenda
              e o "repor leva N semanas" da cobertura de venda.
              Some no celular, onde a linha já empilha e o rótulo do campo
              apareceria fora de lugar.
            */}
            {roteiro.length > 0 && (
              <div className="mb-1 hidden items-center gap-2 px-2 text-[11px] font-medium uppercase tracking-wider text-tinta-fraca sm:flex">
                <span className="w-6 shrink-0" />
                <span className="min-w-0 flex-1">Etapa</span>
                <span className="min-w-0 flex-1">Quem faz</span>
                <span className="w-24 shrink-0">Dias</span>
                <span className="w-[6.5rem] shrink-0" />
              </div>
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
                    <InputNumero
                      min={0}
                      max={365}
                      valor={linha.diasEstimados}
                      aoMudar={(n) => alterarEtapa(i, 'diasEstimados', n ?? 0)}
                      aria-label={`Dias estimados da etapa ${i + 1}`}
                      title="Quantos dias esta etapa costuma levar"
                      placeholder="dias"
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

      <Modal
        aberto={Boolean(paraDuplicar)}
        aoFechar={() => setParaDuplicar(null)}
        titulo="Duplicar peça"
        descricao={paraDuplicar ? `Cópia de ${paraDuplicar.nome}` : undefined}
        largura="max-w-md"
        fecharClicandoFora={false}
      >
        <form onSubmit={duplicar} className="flex flex-col gap-4">
          <Campo
            rotulo="Nome da cópia"
            dica="Roteiro, esmaltes possíveis, mínimos e o custo da original vêm junto. O preço praticado por canal, não: aquilo é venda da peça original."
          >
            {/* sem `onFocus={select}`: num campo de texto isso rouba o clique
                de quem só queria corrigir uma letra no meio */}
            <Input
              ref={campoNomeDaCopia}
              required
              autoFocus
              maxLength={80}
              caixaAlta
              value={nomeDaCopia}
              onChange={(e) => setNomeDaCopia(e.target.value)}
            />
          </Campo>
          <p className="text-xs leading-relaxed text-tinta-fraca">
            A cópia nasce <strong>inativa</strong>: ela só entra no planejamento depois de você revisar e
            ativar.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setParaDuplicar(null)} disabled={duplicando}>
              Cancelar
            </Botao>
            <Botao type="submit" disabled={duplicando || !nomeDaCopia.trim()}>
              {duplicando ? 'Duplicando…' : 'Duplicar'}
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
