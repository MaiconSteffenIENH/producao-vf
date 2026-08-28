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
type MateriaPrima = { id: string; nome: string; tipo: string; unidade: string }

/** Momento em que a medida foi tomada — a argila encolhe entre um e outro. */
type Momento = 'cru' | 'pronto'

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
  /** ficha técnica: o padrão a seguir ao reproduzir a peça; nulo é "ninguém definiu" */
  alturaCm: string | null
  larguraCm: string | null
  capacidadeMl: number | null
  pesoCruG: number | null
  medidasMomento: Momento | null
  medidaToleranciaPct: string | null
  observacao: string | null
  ativo: boolean
  roteiro: { id: string; ordem: number; etapaId: string; etapa: Etapa; responsavelId: string | null; diasEstimados: number }[]
  cores: { id: string; corId: string; qtdMinimaDesejada: number; cor: Cor }[]
  insumos: {
    id: string
    materiaPrimaId: string
    quantidadePorPeca: string
    etapaId: string | null
    corId: string | null
    materiaPrima: MateriaPrima
  }[]
}

type LinhaRoteiro = { etapaId: string; responsavelId: string; diasEstimados: number }
type LinhaInsumo = { materiaPrimaId: string; quantidadePorPeca: number | null; etapaId: string; corId: string }

/*
 * A ficha em uma linha, para o cartão da lista.
 *
 * Espelha `resumoDaFicha` de backend/src/lib/ficha-tecnica.ts. Aqui é só
 * apresentação: quem recusa ficha incoerente é o servidor, então não há regra
 * duplicada — há a mesma frase escrita nos dois lados, e o servidor manda.
 */
/**
 * A faixa aceitável, escrita como "7,6 a 8,4".
 *
 * Espelha `faixaDaMedida` do backend, inclusive o arredondamento para uma casa:
 * é o número que a pessoa lê na tela, e é por ele que o servidor decide se a
 * peça está dentro do padrão. Divergir aqui faria a tela dizer uma coisa e o
 * sistema aceitar outra.
 */
function faixa(alvo: number, toleranciaPct: number): string {
  const uma = (n: number) => Math.round(n * 10) / 10
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))
  const margem = (alvo * Math.max(0, Math.min(100, toleranciaPct))) / 100
  return `${fmt(uma(alvo - margem))} a ${fmt(uma(alvo + margem))}`
}

function resumoDaFicha(p: Peca): string {
  const num = (v: string | null) => (v === null ? null : Number(v))
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))
  const partes: string[] = []
  const altura = num(p.alturaCm)
  const largura = num(p.larguraCm)
  if (altura !== null) partes.push(`${fmt(altura)} cm de altura`)
  if (largura !== null) partes.push(`${fmt(largura)} cm de largura`)
  if (p.capacidadeMl !== null) partes.push(`${p.capacidadeMl} ml`)
  if (p.pesoCruG !== null) partes.push(`${p.pesoCruG} g de barro`)
  if (partes.length === 0) return ''
  const tol = num(p.medidaToleranciaPct)
  return (
    partes.join(' · ') +
    (tol ? `, ± ${fmt(tol)}%` : '') +
    (p.medidasMomento === 'cru' ? ' (medida no cru)' : '')
  )
}

const FORM_VAZIO = {
  nome: '',
  categoriaId: '',
  responsavelInicialId: '',
  tempoMedioDias: 30,
  qtdMinimaDesejada: 0,
  alturaCm: null as number | null,
  larguraCm: null as number | null,
  capacidadeMl: null as number | null,
  pesoCruG: null as number | null,
  medidasMomento: '' as '' | Momento,
  medidaToleranciaPct: null as number | null,
  observacao: '',
  ativo: true,
}

export function Pecas() {
  const [pecas, setPecas] = useState<Peca[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cores, setCores] = useState<Cor[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([])
  const [materiasPrimas, setMateriasPrimas] = useState<MateriaPrima[]>([])

  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')

  const [formAberto, setFormAberto] = useState(false)
  const [editando, setEditando] = useState<Peca | null>(null)
  const [form, setForm] = useState({ ...FORM_VAZIO })
  const [roteiro, setRoteiro] = useState<LinhaRoteiro[]>([])
  const [coresSelecionadas, setCoresSelecionadas] = useState<string[]>([])
  const [insumos, setInsumos] = useState<LinhaInsumo[]>([])
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
    Promise.all([
      api.get('/categorias'),
      api.get('/cores'),
      api.get('/etapas'),
      api.get('/responsaveis'),
      api.get('/materias-primas'),
    ])
      .then(([c, co, e, r, mp]) => {
        setCategorias(c.data)
        setCores(co.data)
        setEtapas(e.data)
        setResponsaveis(r.data)
        setMateriasPrimas(mp.data)
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
    setInsumos([])
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
      // o Prisma devolve Decimal como string; o campo numérico trabalha com número
      alturaCm: peca.alturaCm === null ? null : Number(peca.alturaCm),
      larguraCm: peca.larguraCm === null ? null : Number(peca.larguraCm),
      capacidadeMl: peca.capacidadeMl,
      pesoCruG: peca.pesoCruG,
      medidasMomento: peca.medidasMomento ?? '',
      medidaToleranciaPct: peca.medidaToleranciaPct === null ? null : Number(peca.medidaToleranciaPct),
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
    setInsumos(
      peca.insumos.map((i) => ({
        materiaPrimaId: i.materiaPrimaId,
        quantidadePorPeca: Number(i.quantidadePorPeca),
        etapaId: i.etapaId ?? '',
        corId: i.corId ?? '',
      })),
    )
    setFormAberto(true)
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      const corpo = {
        ...form,
        // o select devolve string vazia quando ninguém escolheu; o servidor
        // espera nulo, que é o que quer dizer "não definido"
        medidasMomento: form.medidasMomento || null,
        roteiro: roteiro.filter((r) => r.etapaId),
        cores: coresSelecionadas.map((corId) => ({ corId, qtdMinimaDesejada: 0 })),
        insumos: insumos.filter((i) => i.materiaPrimaId),
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

  // ── insumos ───────────────────────────────────────────
  const adicionarInsumo = () =>
    setInsumos((s) => [...s, { materiaPrimaId: '', quantidadePorPeca: null, etapaId: '', corId: '' }])
  const removerInsumo = (i: number) => setInsumos((s) => s.filter((_, idx) => idx !== i))
  const alterarInsumo = (i: number, campo: keyof LinhaInsumo, valor: string | number | null) =>
    setInsumos((s) => s.map((linha, idx) => (idx === i ? { ...linha, [campo]: valor } : linha)))

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

              {/* a ficha técnica no cartão: é o padrão que a equipe precisa
                  conferir, e esconder atrás de um clique de edição é o mesmo
                  que não ter */}
              <div className="mt-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-tinta-fraca">Ficha técnica</p>
                {resumoDaFicha(peca) ? (
                  <p className="text-sm text-tinta">{resumoDaFicha(peca)}</p>
                ) : (
                  <p className="text-sm text-tinta-fraca">Sem padrão definido.</p>
                )}
                <p className="mt-1 text-sm text-tinta">
                  {peca.insumos.length === 0 ? (
                    <span className="text-tinta-fraca">Sem insumo cadastrado — não entra na conta de compra.</span>
                  ) : (
                    peca.insumos
                      .map((i) => `${i.materiaPrima.nome} ${Number(i.quantidadePorPeca)} ${i.materiaPrima.unidade}`)
                      .join(' · ')
                  )}
                </p>
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

          {/* ── Ficha técnica ─────────────────────────── */}
          <div className="rounded-xl border border-borda p-3">
            <h3 className="text-sm font-semibold text-tinta">Ficha técnica</h3>
            <p className="mb-3 text-xs leading-relaxed text-tinta-fraca">
              O padrão a ser seguido ao reproduzir a peça. Tudo opcional: peça sem medida continua
              funcionando igual. <strong>A argila encolhe na queima</strong>, então informe em que momento
              as medidas foram tomadas — o mesmo número quer dizer tamanhos diferentes no cru e no pronto.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Altura (cm)">
                <InputNumero
                  decimais={1}
                  valor={form.alturaCm}
                  aoMudar={(n) => setForm({ ...form, alturaCm: n })}
                  placeholder="—"
                />
              </Campo>
              <Campo rotulo="Diâmetro ou largura (cm)">
                <InputNumero
                  decimais={1}
                  valor={form.larguraCm}
                  aoMudar={(n) => setForm({ ...form, larguraCm: n })}
                  placeholder="—"
                />
              </Campo>
              <Campo rotulo="Capacidade (ml)" dica="Só em peça que contém líquido.">
                <InputNumero
                  valor={form.capacidadeMl}
                  aoMudar={(n) => setForm({ ...form, capacidadeMl: n })}
                  placeholder="—"
                />
              </Campo>
              <Campo rotulo="Peso do barro cru (g)" dica="O que o oleiro pesa na hora de tornear.">
                <InputNumero
                  valor={form.pesoCruG}
                  aoMudar={(n) => setForm({ ...form, pesoCruG: n })}
                  placeholder="—"
                />
              </Campo>
              <Campo rotulo="Momento da medição">
                <Select
                  value={form.medidasMomento}
                  onChange={(e) => setForm({ ...form, medidasMomento: e.target.value as '' | Momento })}
                >
                  <option value="">— não definido —</option>
                  <option value="cru">Peça crua, antes de secar</option>
                  <option value="pronto">Peça pronta, depois da 2ª queima</option>
                </Select>
              </Campo>
              <Campo
                rotulo="Tolerância (%)"
                dica="Peça artesanal não sai idêntica. Sem margem, a ficha reprova tudo e ninguém olha."
              >
                <InputNumero
                  decimais={1}
                  max={100}
                  valor={form.medidaToleranciaPct}
                  aoMudar={(n) => setForm({ ...form, medidaToleranciaPct: n })}
                  placeholder="—"
                />
              </Campo>
            </div>

            {/* a faixa aceitável já calculada: é o número que a equipe usa de fato */}
            {form.medidaToleranciaPct !== null && form.medidaToleranciaPct > 0 && (
              <p className="mt-3 rounded-lg bg-superficie-2 px-3 py-2 text-xs leading-relaxed text-tinta">
                Com essa tolerância, aceita-se{' '}
                {[
                  form.alturaCm !== null && `altura de ${faixa(form.alturaCm, form.medidaToleranciaPct)} cm`,
                  form.larguraCm !== null && `largura de ${faixa(form.larguraCm, form.medidaToleranciaPct)} cm`,
                  form.capacidadeMl !== null && `${faixa(form.capacidadeMl, form.medidaToleranciaPct)} ml`,
                  form.pesoCruG !== null && `${faixa(form.pesoCruG, form.medidaToleranciaPct)} g de barro`,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'nada ainda: informe alguma medida acima'}
                .
              </p>
            )}
          </div>

          {/* ── Insumos ───────────────────────────────── */}
          <div className="rounded-xl border border-borda p-3">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-tinta">Insumos consumidos</h3>
                <p className="text-xs leading-relaxed text-tinta-fraca">
                  De que argila esta peça é feita e quanto ela gasta. É daqui que sai o aviso de compra:
                  sem este cadastro, o planejamento não tem como dizer que o esmalte vai faltar.
                </p>
              </div>
              <Botao type="button" variante="secundario" onClick={adicionarInsumo}>
                <Plus size={14} /> Adicionar insumo
              </Botao>
            </div>

            {insumos.length === 0 && (
              <p className="py-2 text-sm text-tinta-fraca">
                Nenhum insumo cadastrado. O consumo desta peça não entra na conta de compra.
              </p>
            )}

            <div className="flex flex-col gap-2">
              {insumos.map((linha, i) => {
                const mp = materiasPrimas.find((m) => m.id === linha.materiaPrimaId)
                return (
                  <div key={i} className="flex flex-col gap-2 rounded-lg bg-superficie-2 p-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <SelecaoBuscavel
                        valor={linha.materiaPrimaId}
                        aoEscolher={(v) => alterarInsumo(i, 'materiaPrimaId', v)}
                        placeholder="— matéria-prima —"
                        vazio="Nada com esse nome."
                        opcoes={materiasPrimas.map((m) => ({ valor: m.id, rotulo: `${m.nome} (${m.tipo})` }))}
                      />
                    </div>
                    <div className="flex items-center gap-2 sm:w-40">
                      <InputNumero
                        decimais={3}
                        valor={linha.quantidadePorPeca}
                        aoMudar={(n) => alterarInsumo(i, 'quantidadePorPeca', n)}
                        aria-label="Quantidade por peça"
                        placeholder="por peça"
                      />
                      <span className="shrink-0 text-sm text-tinta-fraca">{mp?.unidade ?? ''}</span>
                    </div>
                    <div className="min-w-0 sm:w-44">
                      <Select value={linha.corId} onChange={(e) => alterarInsumo(i, 'corId', e.target.value)}>
                        <option value="">— qualquer cor —</option>
                        {cores.map((c) => (
                          <option key={c.id} value={c.id}>
                            só em {c.nome}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removerInsumo(i)}
                      aria-label="Remover insumo"
                      className="shrink-0 self-end rounded-lg p-2 text-tinta-fraca hover:bg-superficie hover:text-perigo sm:self-auto"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )
              })}
            </div>

            {insumos.length > 0 && (
              <p className="mt-2 text-xs leading-relaxed text-tinta-fraca">
                A argila fica em “qualquer cor” — ela é a mesma em todo lote. Esmalte deve ser preso à cor
                dele, senão o sistema pediria Pistache para um lote Coral.
              </p>
            )}
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
