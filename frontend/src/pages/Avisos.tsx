import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlarmClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { avisar } from '../components/Toaster'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  Botao,
  CabecalhoPagina,
  Campo,
  Card,
  Carregando,
  Etiqueta,
  Input,
  Modal,
  Textarea,
  Vazio,
} from '../components/ui'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { useArrastar } from '../lib/useArrastar'
import { dataBr, dataDeCalendarioBr } from '../lib/format'
import { avisarQuadroMudou } from '../lib/quadroDeAvisos'

/*
 * O QUADRO DE AVISOS, POR DIA DA SEMANA.
 *
 * O João anotava o combinado no quadro branco e apagava depois. Uma bandeja de
 * tortinha e duas xícaras de coração verde ficaram para trás porque não havia
 * estoque até a data prometida, e não havia onde consultar o combinado.
 *
 * O formato é o mesmo do quadro de produção porque a pergunta é a mesma: o que
 * cai em qual dia. A diferença é que ali as colunas são etapas, e aqui são os
 * dias úteis — o ateliê não trabalha no fim de semana e o correio fecha às 17h.
 *
 * DUAS COLUNAS NÃO SÃO DIAS. "Atrasado" abre o quadro e "Sem data" fecha:
 * sem elas, um aviso sumiria da tela ao virar a semana, que é exatamente o modo
 * de falha do quadro branco apagado.
 */

type Posicao = {
  coluna: 'atrasado' | 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sem_data'
  dia: string | null
  recuadoDoFimDeSemana: boolean
}

type Aviso = {
  id: string
  titulo: string
  detalhe: string | null
  prazo: string | null
  criadoEm: string
  criadoPor: string | null
  concluidoEm: string | null
  concluidoPor: string | null
  situacao: 'programado' | 'vence_hoje' | 'atrasado' | 'concluido'
  diasDeAtraso: number | null
  urgencia: string
  posicao: Posicao | null
}

type Quadro = {
  semana: { segunda: string; dias: string[]; hoje: string }
  abertos: Aviso[]
  concluidos: Aviso[]
  resumo: { alerta: string; abertos: number; venceHoje: number; atrasados: number; piorAtraso: number }
}

type ChaveColuna = Posicao['coluna']

const COLUNAS: { chave: ChaveColuna; rotulo: string; ehDia: boolean }[] = [
  { chave: 'atrasado', rotulo: 'Atrasado', ehDia: false },
  { chave: 'seg', rotulo: 'Segunda', ehDia: true },
  { chave: 'ter', rotulo: 'Terça', ehDia: true },
  { chave: 'qua', rotulo: 'Quarta', ehDia: true },
  { chave: 'qui', rotulo: 'Quinta', ehDia: true },
  { chave: 'sex', rotulo: 'Sexta', ehDia: true },
  { chave: 'sem_data', rotulo: 'Sem data', ehDia: false },
]

/*
 * O anel é `ring`, e não `border` ou `bg`.
 *
 * O Card já traz `border-borda` e `bg-superficie` na classe base. Uma segunda
 * cor da mesma propriedade vinda pelo className disputaria com ela, e quem
 * vence é a ordem em que o Tailwind emitiu as regras no CSS, não a ordem em que
 * escrevo a string.
 */
const ANEL: Record<string, string> = {
  atrasado: 'ring-2 ring-perigo/55',
  vence_hoje: 'ring-1 ring-perigo/40',
  programado: '',
  concluido: '',
}

const COR_ETIQUETA: Record<string, string> = {
  atrasado: '#a4402f',
  vence_hoje: '#a4402f',
  programado: '#8e7150',
  concluido: '#3e5c4b',
}

const vazio = { titulo: '', detalhe: '', prazo: '' }

/** Soma dias a um AAAA-MM-DD sem passar por fuso nenhum. */
function somarDias(dia: string, quantos: number): string {
  const [ano, mes, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, d + quantos)).toISOString().slice(0, 10)
}

const diaCurto = (iso: string) => {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

export function Avisos() {
  const [quadro, setQuadro] = useState<Quadro | null>(null)
  const [carregando, setCarregando] = useState(true)
  /** segunda-feira da semana na tela; vazio = a semana de hoje, decidida no servidor */
  const [semana, setSemana] = useState('')
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<Aviso | null>(null)
  const [form, setForm] = useState(vazio)
  const [enviando, setEnviando] = useState(false)
  const [apagando, setApagando] = useState<Aviso | null>(null)
  /** o que o arrasto quer fazer, esperando confirmação */
  const [mudanca, setMudanca] = useState<{ aviso: Aviso; para: string } | null>(null)
  const trilho = useRef<HTMLDivElement>(null)

  const recarregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true)
      try {
        const { data } = await api.get('/avisos', { params: semana ? { semana } : {} })
        setQuadro(data)
      } catch (erro) {
        avisar.erro(mensagemDoErro(erro, 'Não deu para carregar o quadro.'))
      } finally {
        setCarregando(false)
      }
    },
    [semana],
  )

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  useAutoRefresh(useCallback(() => void recarregar(true), [recarregar]), {
    aoVivo: true,
    intervaloMs: 60_000,
  })

  const abertos = quadro?.abertos ?? []
  const concluidos = quadro?.concluidos ?? []
  const resumo = quadro?.resumo
  const dias = quadro?.semana.dias ?? []
  const hoje = quadro?.semana.hoje ?? ''

  const porColuna = useMemo(() => {
    const mapa = new Map<ChaveColuna, Aviso[]>(COLUNAS.map((c) => [c.chave, []]))
    for (const aviso of abertos) {
      // sem posição = aviso de outra semana; ele reaparece ao navegar até lá
      if (!aviso.posicao) continue
      mapa.get(aviso.posicao.coluna)?.push(aviso)
    }
    return mapa
  }, [abertos])

  /*
   * Arrastar muda o PRAZO, e por isso passa por confirmação.
   *
   * Mesma decisão do quadro de produção: ele fica aberto o dia todo numa tela
   * de toque, e prazo movido sem querer é entrega perdida. As colunas que não
   * são dia não aceitam soltar — "atrasado" não é um lugar para onde se move
   * um aviso, é uma consequência.
   */
  const { estado: arrasto, pegar } = useArrastar<Aviso>({
    destinosDe: () => dias,
    aoSoltar: (aviso, dia) => setMudanca({ aviso, para: dia }),
    trilho,
  })

  const abrirNovo = () => {
    setEditando(null)
    setForm(vazio)
    setAberto(true)
  }

  const abrirEdicao = (aviso: Aviso) => {
    setEditando(aviso)
    setForm({
      titulo: aviso.titulo,
      detalhe: aviso.detalhe ?? '',
      prazo: aviso.prazo ? aviso.prazo.slice(0, 10) : '',
    })
    setAberto(true)
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    const corpo = { titulo: form.titulo, detalhe: form.detalhe || null, prazo: form.prazo || null }
    try {
      if (editando) await api.put(`/avisos/${editando.id}`, corpo)
      else await api.post('/avisos', corpo)
      avisar.ok(editando ? 'Aviso atualizado.' : 'Aviso no quadro.')
      setAberto(false)
      setForm(vazio)
      setEditando(null)
      await recarregar(true)
      avisarQuadroMudou()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para salvar o aviso.'))
    } finally {
      setEnviando(false)
    }
  }

  const mudarPrazo = async () => {
    if (!mudanca) return
    try {
      await api.put(`/avisos/${mudanca.aviso.id}`, { prazo: mudanca.para })
      setMudanca(null)
      await recarregar(true)
      avisarQuadroMudou()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para mudar o prazo.'))
    }
  }

  const concluir = async (aviso: Aviso) => {
    try {
      await api.post(`/avisos/${aviso.id}/concluir`)
      await recarregar(true)
      avisarQuadroMudou()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para marcar como feito.'))
    }
  }

  const reabrir = async (aviso: Aviso) => {
    try {
      await api.post(`/avisos/${aviso.id}/reabrir`)
      await recarregar(true)
      avisarQuadroMudou()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para reabrir o aviso.'))
    }
  }

  const apagarAgora = async () => {
    if (!apagando) return
    try {
      await api.delete(`/avisos/${apagando.id}`)
      avisar.ok('Aviso apagado.')
      setApagando(null)
      await recarregar(true)
      avisarQuadroMudou()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para apagar o aviso.'))
    }
  }

  if (carregando) return <Carregando texto="Montando a semana…" />

  const segunda = quadro?.semana.segunda ?? ''
  const sexta = dias[4] ?? ''
  const naSemanaDeHoje = Boolean(hoje && dias.includes(hoje))
  const foraDaSemana = abertos.filter((a) => !a.posicao).length

  return (
    <>
      <CabecalhoPagina
        titulo="Avisos"
        descricao="O que foi combinado, no dia em que precisa sair. Enquanto houver aviso aberto, o menu fica marcado — mesmo em outra tela."
        acoes={
          <Botao onClick={abrirNovo} className="col-span-2 justify-center sm:col-span-1">
            <Plus size={16} /> Novo aviso
          </Botao>
        }
      />

      {resumo && resumo.atrasados > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-perigo/30 bg-perigo/5 px-4 py-3 text-sm leading-relaxed text-tinta">
          <AlarmClock size={17} className="mt-0.5 shrink-0 text-perigo" />
          <span>
            <strong className="text-perigo">
              {resumo.atrasados === 1 ? '1 aviso passou do prazo' : `${resumo.atrasados} avisos passaram do prazo`}
            </strong>{' '}
            — o mais antigo há {resumo.piorAtraso === 1 ? '1 dia' : `${resumo.piorAtraso} dias`}. Se ainda dá
            para despachar, o correio fecha às 17h.
          </span>
        </p>
      )}

      {/* navegação da semana: sem isto, o aviso de 14/09 e o de 07/09 cairiam
          os dois na coluna "Segunda" sem nada dizer qual é qual */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSemana(somarDias(segunda, -7))}
          aria-label="Semana anterior"
          className="grid h-11 w-11 place-items-center rounded-xl border border-borda bg-superficie text-tinta-fraca transition hover:border-marca-clara hover:text-tinta"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="min-w-[10rem] text-center text-sm font-medium text-tinta">
          {diaCurto(segunda)} a {diaCurto(sexta)}
        </span>
        <button
          onClick={() => setSemana(somarDias(segunda, 7))}
          aria-label="Próxima semana"
          className="grid h-11 w-11 place-items-center rounded-xl border border-borda bg-superficie text-tinta-fraca transition hover:border-marca-clara hover:text-tinta"
        >
          <ChevronRight size={18} />
        </button>
        {!naSemanaDeHoje && (
          <button
            onClick={() => setSemana('')}
            className="min-h-11 rounded-xl border border-borda bg-superficie px-3 text-sm text-tinta-fraca transition hover:border-marca-clara hover:text-tinta"
          >
            Voltar para esta semana
          </button>
        )}
        {foraDaSemana > 0 && (
          <span className="text-xs text-tinta-fraca">
            {foraDaSemana === 1
              ? '1 aviso em outra semana'
              : `${foraDaSemana} avisos em outras semanas`}
          </span>
        )}
      </div>

      {abertos.length === 0 ? (
        <Vazio
          icone={<ClipboardList size={22} />}
          titulo="Nada pendente"
          descricao="Quando alguém combinar uma entrega ou precisar lembrar de algo, registre aqui. O card vai para o dia do prazo, o quadro fica marcado no menu até ser concluído, e o combinado continua consultável depois."
          acao={<Botao onClick={abrirNovo}>Registrar o primeiro</Botao>}
        />
      ) : (
        <div ref={trilho} className="snap-x snap-proximity overflow-x-auto pb-3">
          <div className="flex min-w-max gap-3">
            {COLUNAS.map((coluna, i) => {
              const daColuna = porColuna.get(coluna.chave) ?? []
              const dia = coluna.ehDia ? dias[i - 1] : null
              const ehHoje = Boolean(dia && dia === hoje)
              const alvo = dia ?? undefined
              return (
                <section
                  key={coluna.chave}
                  // lido do DOM ao soltar, e não de retângulos em estado: assim o
                  // quadro pode rolar no meio do arrasto sem as áreas saírem do lugar
                  data-alvo-arrasto={alvo}
                  className={`w-[15rem] shrink-0 snap-start rounded-2xl transition-colors duration-150 ${
                    arrasto.item && alvo
                      ? arrasto.alvo === alvo
                        ? 'bg-marca/12 outline-2 outline-dashed outline-marca'
                        : 'bg-marca/5 outline-2 outline-dashed outline-marca-clara'
                      : arrasto.item
                        ? // atrasado e sem data não recebem: não são um lugar para
                          // onde se move um aviso, são consequência do prazo
                          'opacity-40'
                        : ''
                  }`}
                >
                  <header
                    className={`sticky top-0 z-10 mb-2.5 flex min-h-[2.75rem] items-center justify-between gap-2 rounded-xl px-3.5 py-2 backdrop-blur-md ${
                      coluna.chave === 'atrasado'
                        ? 'bg-perigo/12'
                        : ehHoje
                          ? 'bg-marca/20'
                          : 'bg-tinta/6'
                    }`}
                  >
                    <span className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-tinta">
                        {coluna.rotulo}
                        {ehHoje && <span className="ml-1.5 text-xs font-normal text-marca">hoje</span>}
                      </h2>
                      {dia && <span className="block text-[11px] text-tinta-fraca">{diaCurto(dia)}</span>}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-tinta">{daColuna.length}</span>
                  </header>

                  <div className="flex flex-col gap-2 px-0.5">
                    {daColuna.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-borda px-3 py-6 text-center text-xs text-tinta-fraca">
                        vazio
                      </p>
                    ) : (
                      daColuna.map((aviso) => (
                        <Card
                          key={aviso.id}
                          className={`cursor-grab select-none p-3 active:cursor-grabbing ${ANEL[aviso.situacao] ?? ''}`}
                        >
                          {/* `pegar` devolve os props do arrasto; ele já ignora
                              clique em botão de dentro do cartão */}
                          <div {...pegar(aviso)}>
                            <p className="text-sm font-medium leading-snug text-tinta">{aviso.titulo}</p>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Etiqueta cor={COR_ETIQUETA[aviso.situacao]}>{aviso.urgencia}</Etiqueta>
                              {aviso.posicao?.recuadoDoFimDeSemana && (
                                <span
                                  title={`Combinado para ${dataDeCalendarioBr(aviso.prazo)}, que cai no fim de semana`}
                                  className="rounded-md bg-ouro/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ouro"
                                >
                                  era {dataDeCalendarioBr(aviso.prazo)}
                                </span>
                              )}
                            </span>
                            {aviso.detalhe && (
                              <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-tinta-fraca">
                                {aviso.detalhe}
                              </p>
                            )}
                            {aviso.criadoPor && (
                              <p className="mt-1 text-[11px] text-tinta-fraca">por {aviso.criadoPor}</p>
                            )}
                          </div>

                          {/* alvo de toque de 44px: o quadro é usado em pé, no celular */}
                          <div className="mt-2.5 flex gap-1">
                            <Botao onClick={() => void concluir(aviso)} className="min-h-11 flex-1 justify-center">
                              <Check size={15} /> Feito
                            </Botao>
                            <button
                              onClick={() => abrirEdicao(aviso)}
                              aria-label={`Editar ${aviso.titulo}`}
                              className="min-h-11 rounded-lg px-2.5 text-tinta-fraca transition hover:bg-superficie-2 hover:text-tinta"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => setApagando(aviso)}
                              aria-label={`Apagar ${aviso.titulo}`}
                              className="min-h-11 rounded-lg px-2.5 text-tinta-fraca transition hover:bg-superficie-2 hover:text-perigo"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      )}

      {/* o cartão fantasma segue o dedo; sem ele o arrasto no toque não tem
          retorno nenhum e parece que não pegou */}
      {arrasto.item && (
        <div
          className="pointer-events-none fixed z-[80] w-[13rem] rotate-2 rounded-2xl border border-marca bg-superficie p-3 opacity-95 shadow-alta"
          style={{ left: arrasto.x - 100, top: arrasto.y - 24 }}
        >
          <p className="truncate text-sm font-medium text-tinta">{arrasto.item.titulo}</p>
        </div>
      )}

      {concluidos.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-titulo text-lg text-tinta">Já resolvidos</h2>
          {/* concluir não apaga: poder consultar o combinado depois é
              exatamente o que o quadro branco não permitia */}
          <p className="mb-3 text-sm text-tinta-fraca">
            Ficam guardados para consulta. Se algum foi marcado por engano, dá para reabrir.
          </p>
          <div className="flex flex-col gap-2">
            {concluidos.map((aviso) => (
              <Card key={aviso.id} className="flex flex-col gap-3 opacity-75 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-tinta line-through decoration-tinta-fraca/50">
                    {aviso.titulo}
                  </p>
                  <p className="mt-0.5 text-xs text-tinta-fraca">
                    Feito por {aviso.concluidoPor ?? 'alguém do ateliê'} em {dataBr(aviso.concluidoEm)}
                    {aviso.prazo && ` · combinado até ${dataDeCalendarioBr(aviso.prazo)}`}
                  </p>
                </div>
                <button
                  onClick={() => void reabrir(aviso)}
                  className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm text-tinta-fraca transition hover:bg-superficie-2 hover:text-tinta"
                >
                  <RotateCcw size={15} /> Reabrir
                </button>
              </Card>
            ))}
          </div>
        </section>
      )}

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={editando ? 'Editar aviso' : 'Novo aviso'}
        descricao="Um aviso por combinado. O card vai para a coluna do dia do prazo."
        largura="max-w-lg"
      >
        <form onSubmit={salvar} className="flex flex-col gap-4">
          <Campo rotulo="O que precisa ser feito" dica="Frase curta: é o que aparece no card.">
            <Input
              required
              autoFocus
              maxLength={140}
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="ex.: despachar bandeja de tortinha"
            />
          </Campo>

          <Campo
            rotulo="Até quando"
            dica="Sem data, o card fica na última coluna. Prazo de sábado ou domingo aparece na sexta: o correio fecha e o ateliê não trabalha."
          >
            <Input
              type="date"
              value={form.prazo}
              onChange={(e) => setForm({ ...form, prazo: e.target.value })}
            />
          </Campo>

          {/* O exemplo cabe em UMA linha de propósito: em duas ele passava por
              texto já salvo, e a pessoa fechava o formulário achando que o
              campo estava preenchido. */}
          <Campo rotulo="Detalhe" dica="Cliente, quantidade, cor, o que ajudar quem for fazer.">
            <Textarea
              rows={3}
              maxLength={1000}
              value={form.detalhe}
              onChange={(e) => setForm({ ...form, detalhe: e.target.value })}
              placeholder="ex.: duas xícaras coração verde, sai sexta"
            />
          </Campo>

          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
            <Botao type="submit" disabled={enviando}>
              {enviando ? 'Salvando…' : editando ? 'Salvar' : 'Colocar no quadro'}
            </Botao>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        aberto={mudanca !== null}
        titulo="Mudar o prazo?"
        mensagem={
          `“${mudanca?.aviso.titulo ?? ''}” passa a vencer em ${dataDeCalendarioBr(mudanca?.para ?? null)}` +
          (mudanca?.aviso.prazo ? `, no lugar de ${dataDeCalendarioBr(mudanca.aviso.prazo)}.` : '.')
        }
        textoConfirmar="Mudar"
        aoConfirmar={() => void mudarPrazo()}
        aoCancelar={() => setMudanca(null)}
      />

      <ConfirmDialog
        aberto={apagando !== null}
        titulo="Apagar este aviso?"
        mensagem={
          `“${apagando?.titulo ?? ''}” some do quadro e do histórico. ` +
          'Se ele já foi resolvido, o certo é marcar como feito: assim continua consultável.'
        }
        textoConfirmar="Apagar"
        perigo
        aoConfirmar={() => void apagarAgora()}
        aoCancelar={() => setApagando(null)}
      />
    </>
  )
}
