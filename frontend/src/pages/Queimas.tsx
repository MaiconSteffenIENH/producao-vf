import { useCallback, useEffect, useState } from 'react'
import { Flame, Plus, ThermometerSun } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { avisar } from '../components/Toaster'
import { Botao, CabecalhoPagina, Card, Carregando, Etiqueta, Vazio } from '../components/ui'

/*
 * O FORNO.
 *
 * A tela responde duas perguntas que o quadro de produção não respondia:
 * "cabe?" e "quantas faltam para valer a queima?".
 *
 * A frase que muda a ordem do dia está no cartão de cima: peça não espera o
 * forno, espera o forno ENCHER — então as 12 que faltam para fechar a carga
 * adiantam as outras 68.
 */

type Fila = {
  tipo: 'biscoito' | 'esmalte'
  situacao: {
    capacidade: number
    esperando: number
    cabeAgora: number
    faltamParaFechar: number
    podeQueimar: boolean
    ocupacao: number
    esperaMaisLonga: number
  }
  recomendacao: { acao: 'queimar' | 'completar' | 'esperar'; faltam?: number; motivo: string }
  lotes: { loteId: string; codigo: string; pecaNome: string; quantidade: number; diasParado: number }[]
}

type Queima = {
  id: string
  codigo: string
  tipo: string
  status: string
  capacidade: number
  criadoEm: string
  itens: { id: string; quantidade: number; lote: { codigo: string; peca: { nome: string } } }[]
}

const ROTULO_TIPO: Record<string, string> = { biscoito: '1ª queima (biscoito)', esmalte: '2ª queima (esmalte)' }
const COR_STATUS: Record<string, string> = {
  planejada: '#8a807c',
  carregando: '#a66836',
  queimando: '#a4402f',
  concluida: '#3e5c4b',
  cancelada: '#8a807c',
}

/** A barra de ocupação do forno. Comparar 68/80 de cabeça ninguém faz. */
function Ocupacao({ situacao }: { situacao: Fila['situacao'] }) {
  const pct = situacao.ocupacao
  const cor = pct >= 100 ? '#3e5c4b' : pct >= 60 ? '#a66836' : '#8e7150'
  return (
    <div className="mt-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-superficie-2">
        <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: cor }} />
      </div>
      <p className="mt-1.5 text-xs text-tinta-fraca">
        {situacao.esperando} de {situacao.capacidade} lugares · {pct}% do forno
      </p>
    </div>
  )
}

function CartaoFila({ fila, aoAbrir, abrindo }: { fila: Fila; aoAbrir: () => void; abrindo: boolean }) {
  const { situacao, recomendacao } = fila
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 font-titulo text-xl text-tinta">
          <Flame size={18} className="text-alerta" />
          {ROTULO_TIPO[fila.tipo] ?? fila.tipo}
        </h2>
        {recomendacao.acao === 'queimar' ? (
          <Etiqueta cor="#3e5c4b">pode queimar</Etiqueta>
        ) : recomendacao.acao === 'completar' ? (
          <Etiqueta cor="#a66836">faltam {recomendacao.faltam}</Etiqueta>
        ) : (
          <Etiqueta cor="#8a807c">fila vazia</Etiqueta>
        )}
      </div>

      <Ocupacao situacao={situacao} />

      {/* a frase que muda a ordem do dia */}
      <p className="mt-3 rounded-xl bg-superficie-2 px-3.5 py-2.5 text-sm leading-relaxed text-tinta">
        {recomendacao.motivo}
      </p>

      {situacao.esperaMaisLonga > 0 && (
        <p className="mt-2 text-xs text-tinta-fraca">
          A peça mais antiga da fila está parada há {situacao.esperaMaisLonga}{' '}
          {situacao.esperaMaisLonga === 1 ? 'dia' : 'dias'}.
        </p>
      )}

      {fila.lotes.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-tinta">Na fila ({fila.lotes.length})</h3>
          <ul className="flex flex-col gap-1.5">
            {fila.lotes.slice(0, 8).map((l) => (
              <li
                key={l.loteId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-superficie-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-tinta">
                  {l.pecaNome} <span className="text-xs text-tinta-fraca">{l.codigo}</span>
                </span>
                <span className="shrink-0 text-tinta-fraca">
                  {l.quantidade} · parado há {l.diasParado}d
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fila.lotes.length > 0 && (
        <Botao onClick={aoAbrir} disabled={abrindo} className="mt-4 w-full justify-center">
          <Plus size={16} /> {abrindo ? 'Montando…' : `Montar fornada com ${situacao.cabeAgora}`}
        </Botao>
      )}
    </Card>
  )
}

export function Queimas() {
  const [filas, setFilas] = useState<Fila[]>([])
  const [queimas, setQueimas] = useState<Queima[]>([])
  const [carregando, setCarregando] = useState(true)
  const [abrindo, setAbrindo] = useState<string | null>(null)

  const recarregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const [f, q] = await Promise.all([api.get('/queimas/fila'), api.get('/queimas')])
      setFilas(f.data)
      setQueimas(q.data)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para carregar o forno.'))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])
  useAutoRefresh(useCallback(() => void recarregar(true), [recarregar]))

  const abrir = async (tipo: string) => {
    setAbrindo(tipo)
    try {
      const { data } = await api.post('/queimas', { tipo })
      avisar.ok(`Fornada ${data.codigo} montada.`)
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para montar a fornada.'))
    } finally {
      setAbrindo(null)
    }
  }

  const mudarStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/queimas/${id}/status`, { status })
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para mudar o status.'))
    }
  }

  if (carregando) return <Carregando texto="Vendo o que está esperando o forno…" />

  return (
    <>
      <CabecalhoPagina
        titulo="Forno"
        descricao="Peça não espera o forno — espera o forno encher. Aqui dá para ver se já vale queimar e quanto falta para fechar a carga."
      />

      {filas.length === 0 ? (
        <Vazio
          icone={<ThermometerSun size={22} />}
          titulo="O forno ainda não está configurado"
          descricao="Cadastre um responsável do tipo forno com a capacidade por carga, e marque as etapas de queima com 'aguarda carga'. Sem isso o sistema não tem como falar de fornada."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filas.map((f) => (
            <CartaoFila key={f.tipo} fila={f} abrindo={abrindo === f.tipo} aoAbrir={() => abrir(f.tipo)} />
          ))}
        </div>
      )}

      {queimas.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 font-titulo text-xl text-tinta">Fornadas</h2>
          <div className="flex flex-col gap-2">
            {queimas.map((q) => {
              const total = q.itens.reduce((n, i) => n + i.quantidade, 0)
              return (
                <Card key={q.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-tinta">{q.codigo}</h3>
                      <Etiqueta cor={COR_STATUS[q.status] ?? '#8a807c'}>{q.status}</Etiqueta>
                      <span className="text-sm text-tinta-fraca">{ROTULO_TIPO[q.tipo] ?? q.tipo}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-tinta-fraca">
                      {total} de {q.capacidade} lugares ·{' '}
                      {q.itens.map((i) => `${i.lote.peca.nome} (${i.quantidade})`).join(', ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {q.status === 'carregando' && (
                      <Botao variante="secundario" onClick={() => mudarStatus(q.id, 'queimando')}>
                        Acender
                      </Botao>
                    )}
                    {q.status === 'queimando' && (
                      <Botao variante="secundario" onClick={() => mudarStatus(q.id, 'concluida')}>
                        Concluir
                      </Botao>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-tinta-fraca">
        A fila sai do livro-razão: são os saldos parados nas etapas marcadas como &ldquo;aguarda carga&rdquo;.
        Ninguém digita quantas peças estão esperando. Montar a fornada respeita a ordem de espera — quem
        está parado há mais tempo entra primeiro, senão o lote pequeno nunca entraria.
      </p>
    </>
  )
}
