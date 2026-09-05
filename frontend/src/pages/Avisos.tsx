import { useCallback, useEffect, useState } from 'react'
import { AlarmClock, Check, ClipboardList, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
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
import { dataBr } from '../lib/format'
import { avisarQuadroMudou } from '../lib/quadroDeAvisos'

/*
 * O QUADRO DE AVISOS.
 *
 * O João anotava o combinado no quadro branco e apagava depois. Uma bandeja de
 * tortinha e duas xícaras de coração verde ficaram para trás porque não havia
 * estoque até a data prometida, e não havia onde consultar o que tinha sido
 * combinado com o cliente.
 *
 * Correio fecha às 17h. Perder o dia é perder a entrega, e é por isso que a
 * cor do menu importa mais do que esta tela: quem precisa do aviso é quem NÃO
 * está olhando para ele.
 */

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
}

type Quadro = {
  abertos: Aviso[]
  concluidos: Aviso[]
  resumo: { alerta: string; abertos: number; venceHoje: number; atrasados: number; piorAtraso: number }
}

/*
 * A cor é a mesma dos três estados do menu, de propósito: quem vê vermelho na
 * lateral precisa reencontrar exatamente aquele vermelho ao abrir a tela.
 *
 * O DESTAQUE É `ring`, E NÃO `border` OU `bg`.
 *
 * O Card já traz `border-borda` e `bg-superficie` na própria classe base. Uma
 * segunda cor de borda ou de fundo vinda pelo className disputaria a MESMA
 * propriedade, e quem vence não é a ordem em que escrevo a string, e sim a
 * ordem em que o Tailwind emitiu as duas regras no CSS. O anel é propriedade
 * separada: aparece sempre, sem depender disso.
 */
const APARENCIA: Record<string, { anel: string; etiqueta: string }> = {
  atrasado: { anel: 'ring-2 ring-perigo/55', etiqueta: '#a4402f' },
  vence_hoje: { anel: 'ring-1 ring-perigo/40', etiqueta: '#a4402f' },
  programado: { anel: '', etiqueta: '#8e7150' },
  concluido: { anel: '', etiqueta: '#3e5c4b' },
}

const vazio = { titulo: '', detalhe: '', prazo: '' }

export function Avisos() {
  const [quadro, setQuadro] = useState<Quadro | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<Aviso | null>(null)
  const [form, setForm] = useState(vazio)
  const [enviando, setEnviando] = useState(false)
  const [apagando, setApagando] = useState<Aviso | null>(null)

  const recarregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const { data } = await api.get('/avisos')
      setQuadro(data)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para carregar o quadro.'))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  /*
   * `useCallback` não é enfeite aqui: sem ele a função muda a cada render, o
   * efeito do useAutoRefresh se remonta junto e o intervalo reinicia antes de
   * completar — o polling nunca dispararia.
   *
   * Um minuto porque o que se persegue é a virada do dia: quem deixa a tela
   * aberta desde ontem precisa ver o card ficar vermelho sem recarregar nada.
   */
  useAutoRefresh(useCallback(() => void recarregar(true), [recarregar]), {
    aoVivo: true,
    intervaloMs: 60_000,
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
      // o input date quer AAAA-MM-DD, e o prazo chega como instante ISO
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

  if (carregando) return <Carregando />

  const abertos = quadro?.abertos ?? []
  const concluidos = quadro?.concluidos ?? []
  const resumo = quadro?.resumo

  return (
    <>
      <CabecalhoPagina
        titulo="Avisos"
        descricao="O que foi combinado e não pode ser esquecido. Enquanto houver aviso aberto, o menu fica marcado — mesmo em outra tela."
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

      {abertos.length === 0 ? (
        <Vazio
          icone={<ClipboardList size={22} />}
          titulo="Nada pendente"
          descricao="Quando alguém combinar uma entrega ou precisar lembrar de algo, registre aqui. O quadro fica marcado no menu até o aviso ser concluído, e o combinado continua consultável depois."
          acao={<Botao onClick={abrirNovo}>Registrar o primeiro</Botao>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {abertos.map((aviso) => {
            const visual = APARENCIA[aviso.situacao] ?? APARENCIA.programado
            return (
              <Card key={aviso.id} className={`flex flex-col gap-3 sm:flex-row sm:items-start ${visual.anel}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium text-tinta">{aviso.titulo}</h2>
                    <Etiqueta cor={visual.etiqueta}>{aviso.urgencia}</Etiqueta>
                  </div>
                  {aviso.detalhe && (
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-tinta-fraca">
                      {aviso.detalhe}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-tinta-fraca">
                    {aviso.prazo ? `Até ${dataBr(aviso.prazo)}` : 'Sem data marcada'}
                    {aviso.criadoPor && ` · anotado por ${aviso.criadoPor}`}
                  </p>
                </div>

                {/* alvo de toque de 44px: o quadro é usado em pé, no celular */}
                <div className="flex shrink-0 gap-1">
                  <Botao onClick={() => void concluir(aviso)} className="min-h-11">
                    <Check size={16} /> Feito
                  </Botao>
                  <button
                    onClick={() => abrirEdicao(aviso)}
                    aria-label={`Editar ${aviso.titulo}`}
                    className="min-h-11 rounded-lg px-3 text-tinta-fraca transition hover:bg-superficie-2 hover:text-tinta"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setApagando(aviso)}
                    aria-label={`Apagar ${aviso.titulo}`}
                    className="min-h-11 rounded-lg px-3 text-tinta-fraca transition hover:bg-superficie-2 hover:text-perigo"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </Card>
            )
          })}
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
                    {aviso.prazo && ` · combinado até ${dataBr(aviso.prazo)}`}
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
        descricao="Um aviso por combinado. O prazo é opcional, mas é ele que muda a cor do menu."
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
              placeholder="Despachar bandeja de tortinha do cliente"
            />
          </Campo>

          <Campo
            rotulo="Até quando"
            dica="Deixe em branco se não houver data. Com data, o menu fica vermelho no dia."
          >
            <Input
              type="date"
              value={form.prazo}
              onChange={(e) => setForm({ ...form, prazo: e.target.value })}
            />
          </Campo>

          <Campo rotulo="Detalhe" dica="Cliente, quantidade, cor, o que ajudar quem for fazer.">
            <Textarea
              rows={3}
              maxLength={1000}
              value={form.detalhe}
              onChange={(e) => setForm({ ...form, detalhe: e.target.value })}
              placeholder="Duas xícaras coração verde. Cliente avisado que sai na sexta."
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
