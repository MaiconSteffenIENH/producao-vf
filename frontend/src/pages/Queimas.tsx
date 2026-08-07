import { useCallback, useEffect, useState } from 'react'
import { Flame, Plus, ThermometerSun } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { avisar } from '../components/Toaster'
import { Botao, CabecalhoPagina, Campo, Card, Carregando, Etiqueta, InputNumero, Modal, Textarea, Vazio } from '../components/ui'

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

type ItemPrevia = {
  loteId: string
  codigo: string
  pecaNome: string
  /** quanto entrou no forno */
  quantidade: number
  /** quanto ainda está parado na etapa de queima */
  naEtapa: number
  /** o que ainda falta mover deste lote */
  aoConcluir: number
  /** quanto já foi baixado como quebra desta fornada, numa tentativa anterior */
  jaPerdido: number
  /** quantas de fato mudam de etapa */
  vaiAvancar: number
  /** a etapa seguinte escolhe o esmalte e este lote ainda está neutro */
  esperandoEsmalte: boolean
  proximaEtapa: string | null
}

type Previa = { codigo: string; status: string; itens: ItemPrevia[] }

/*
 * A JANELA DE CONCLUSÃO DA FORNADA.
 *
 * Ela existe por um motivo só: no ateliê quebra peça em toda fornada. Se
 * concluir simplesmente empurrasse tudo para a frente, a peça estourada
 * continuaria contando como estoque, a taxa de perda ficaria mentirosa e o
 * custo por peça — que usa a perda medida — viria baixo demais.
 *
 * O caminho normal é UM CLIQUE: cada lote já vem com quebra zero. Só quem
 * quebrou é digitado. O relato de cada quebra também já vem escrito ("Quebrou
 * na fornada Q-0007") porque ninguém digita justificativa em pé, com barro na
 * mão — mas continua editável para quem quiser contar o que houve.
 */
function ModalConclusao({
  queimaId,
  aoFechar,
  aoConcluir,
}: {
  queimaId: string
  aoFechar: () => void
  aoConcluir: () => void
}) {
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [quebras, setQuebras] = useState<Record<string, string>>({})
  const [relatos, setRelatos] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const { data } = await api.get(`/queimas/${queimaId}/previa-conclusao`)
        if (vivo) setPrevia(data)
      } catch (erro) {
        avisar.erro(mensagemDoErro(erro, 'Não deu para ver o que está na fornada.'))
        if (vivo) aoFechar()
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [queimaId, aoFechar])

  const itens = previa?.itens ?? []

  /*
   * O CAMPO DE QUEBRA ACEITA QUALQUER COISA, e a conta não pode fingir que não.
   *
   * `Number('-5')` é -5 e `-5 > aoConcluir` é falso: o botão continuava
   * habilitado e o resumo mostrava MAIS peças seguindo do que existem. O
   * servidor recusava, mas com mensagem crua do validador, em inglês. Aqui a
   * entrada é classificada antes de virar conta.
   */
  const quebrou = (loteId: string) => {
    const bruto = (quebras[loteId] ?? '').trim()
    if (bruto === '') return 0
    const n = Number(bruto)
    return Number.isFinite(n) ? n : NaN
  }
  const invalida = (i: ItemPrevia) => {
    const n = quebrou(i.loteId)
    return !Number.isInteger(n) || n < 0 || n > i.aoConcluir
  }

  const numero = (i: ItemPrevia) => (invalida(i) ? 0 : quebrou(i.loteId))
  const totalQuebrado = itens.reduce((s, i) => s + numero(i), 0)
  // só conta o que de fato muda de etapa: na última parada do roteiro, nada
  // avança, e somar essas peças aqui faria a tela prometer o que não acontece
  const totalAvancado = itens.reduce(
    (s, i) => s + (i.vaiAvancar > 0 ? Math.max(0, i.aoConcluir - numero(i)) : 0),
    0,
  )
  const excedeu = itens.some(invalida)
  const travado = itens.some((i) => i.esperandoEsmalte && i.aoConcluir > 0)

  const confirmar = async () => {
    setSalvando(true)
    try {
      const { data } = await api.post(`/queimas/${queimaId}/concluir`, {
        quebras: itens.map((i) => ({
          loteId: i.loteId,
          quantidade: quebrou(i.loteId),
          motivo: relatos[i.loteId] ?? '',
        })),
      })
      avisar.ok(
        `${previa?.codigo ?? 'Fornada'} concluída: ${data.avancadas} seguiram` +
          (data.perdidas > 0 ? `, ${data.perdidas} quebraram` : '') +
          '.',
      )
      // aviso não é falha: "usei o que está lá" em vermelho parece erro
      for (const aviso of (data.avisos ?? []) as string[]) avisar.info(aviso)
      aoConcluir()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para concluir a fornada.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`Concluir ${previa?.codigo ?? 'a fornada'}`}
      descricao="Confira o que saiu do forno. Se não quebrou nada, é só confirmar."
      fecharClicandoFora={false}
    >
      {carregando ? (
        <Carregando texto="Vendo o que está na fornada…" />
      ) : itens.length === 0 ? (
        <p className="text-sm text-tinta-fraca">Esta fornada está vazia — não há o que mover.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {itens.map((i) => {
            const q = numero(i)
            const sobrou = Math.max(0, i.aoConcluir - q)
            return (
              <div key={i.loteId} className="rounded-xl border border-borda bg-superficie-2 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-tinta">
                    {i.pecaNome} <span className="text-tinta-fraca">· {i.codigo}</span>
                  </p>
                  <p className="text-sm text-tinta-fraca">
                    {i.aoConcluir} no forno
                    {i.proximaEtapa ? ` → ${i.proximaEtapa}` : ' · última etapa do roteiro'}
                  </p>
                </div>

                {i.jaPerdido > 0 && (
                  <p className="mt-2 rounded-lg bg-superficie px-2.5 py-1.5 text-xs text-tinta">
                    Uma tentativa anterior já registrou {i.jaPerdido} quebrada(s) deste lote. Esse número
                    não muda por aqui — se estiver errado, ajuste pelo quadro.
                  </p>
                )}

                {i.esperandoEsmalte && (
                  <p className="mt-2 rounded-lg border border-perigo/30 bg-superficie px-2.5 py-1.5 text-xs text-tinta">
                    A etapa seguinte é a que escolhe o esmalte, e este lote ainda está neutro. Avance
                    este lote pelo quadro escolhendo a cor, e volte para concluir a fornada.
                  </p>
                )}

                {i.naEtapa < i.quantidade - i.jaPerdido && (
                  <p className="mt-2 rounded-lg bg-superficie px-2.5 py-1.5 text-xs text-tinta">
                    Entraram {i.quantidade} nesta fornada, mas só {i.naEtapa} ainda estão na etapa — alguém
                    já mexeu neste lote pelo quadro. Vou usar {i.aoConcluir}.
                  </p>
                )}

                <div className="mt-2.5 grid gap-2 sm:grid-cols-[8rem_1fr]">
                  <Campo rotulo="Quebrou">
                    <InputNumero
                      min={0}
                      max={i.aoConcluir}
                      disabled={i.jaPerdido > 0 || i.aoConcluir === 0}
                      valor={
                        i.jaPerdido > 0
                          ? i.jaPerdido
                          : (quebras[i.loteId] ?? '') === ''
                            ? 0
                            : Number(quebras[i.loteId])
                      }
                      aoMudar={(n) =>
                        setQuebras((a) => ({ ...a, [i.loteId]: n === null ? '' : String(n) }))
                      }
                    />
                  </Campo>
                  {q > 0 && (
                    <Campo rotulo="O que houve" dica="Vai gravado como “Quebrou no forno”.">
                      <Textarea
                        rows={2}
                        placeholder={`Quebrou na fornada ${previa?.codigo ?? ''}.`}
                        value={relatos[i.loteId] ?? ''}
                        onChange={(e) => setRelatos((a) => ({ ...a, [i.loteId]: e.target.value }))}
                      />
                    </Campo>
                  )}
                </div>

                {invalida(i) ? (
                  <p className="mt-2 text-xs text-perigo">
                    Escreva um número inteiro de 0 a {i.aoConcluir} — é quanto deste lote está no forno.
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-tinta-fraca">
                    {sobrou} {sobrou === 1 ? 'segue' : 'seguem'}
                    {i.vaiAvancar > 0 && i.proximaEtapa ? ` para ${i.proximaEtapa}` : ' onde está'}
                    {q > 0 ? ` · ${q} vira perda` : ''}
                  </p>
                )}
              </div>
            )
          })}

          <p className="text-sm text-tinta">
            No total: <strong>{totalAvancado}</strong> seguem
            {totalQuebrado > 0 ? (
              <>
                {' '}
                e <strong>{totalQuebrado}</strong> viram perda de forno
              </>
            ) : null}
            .
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </Botao>
        <Botao
          onClick={confirmar}
          disabled={salvando || carregando || excedeu || travado || itens.length === 0}
        >
          {salvando ? 'Concluindo…' : 'Concluir fornada'}
        </Botao>
      </div>
    </Modal>
  )
}

export function Queimas() {
  const [filas, setFilas] = useState<Fila[]>([])
  const [queimas, setQueimas] = useState<Queima[]>([])
  const [carregando, setCarregando] = useState(true)
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const [concluindo, setConcluindo] = useState<string | null>(null)

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
          descricao="Em Etapas, marque a etapa de queima com “aguarda carga” e preencha a capacidade por carga. O forno não é uma pessoa: a capacidade e as horas ficam na própria etapa."
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
                      <Botao variante="secundario" onClick={() => setConcluindo(q.id)}>
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

      {concluindo && (
        <ModalConclusao
          queimaId={concluindo}
          aoFechar={() => setConcluindo(null)}
          aoConcluir={() => {
            setConcluindo(null)
            void recarregar(true)
          }}
        />
      )}

      <p className="mt-6 text-xs leading-relaxed text-tinta-fraca">
        Concluir a fornada é o que MOVE as peças: o que quebrou vira perda de forno e o resto avança
        sozinho para a próxima etapa do roteiro de cada lote. Não precisa repetir nada no quadro.
      </p>

      <p className="mt-2 text-xs leading-relaxed text-tinta-fraca">
        A fila sai do livro-razão: são os saldos parados nas etapas marcadas como &ldquo;aguarda carga&rdquo;.
        Ninguém digita quantas peças estão esperando. Montar a fornada respeita a ordem de espera — quem
        está parado há mais tempo entra primeiro, senão o lote pequeno nunca entraria.
      </p>
    </>
  )
}
