import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Brush, Camera, ClipboardCheck, Flame, Hammer, ShoppingCart } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { avisar } from '../components/Toaster'
import { Botao, CabecalhoPagina, Card, Carregando, Etiqueta, Vazio } from '../components/ui'
import { formaPlural } from '../lib/format'

type Sugestao = {
  tipo: 'produzir' | 'esmaltar' | 'comprar' | 'queimar' | 'fotografar' | 'encomenda'
  titulo: string
  detalhe: string
  quantidade: number
  prioridade: number
  pecaId?: string
  pecaNome?: string
  corId?: string
  corNome?: string
  corHex?: string
  encomendaId?: string
  queimaTipo?: string
  situacao: string
  situacaoDetalhe: string
  previsao?: string
  ajustePerda?: { comecar: number; entregar: number; percentual: number; origem: string }
}

const ICONE = {
  produzir: Hammer,
  esmaltar: Brush,
  comprar: ShoppingCart,
  queimar: Flame,
  fotografar: Camera,
  encomenda: ClipboardCheck,
}

const SITUACAO: Record<string, { rotulo: string; cor: string }> = {
  nao_iniciada: { rotulo: 'não iniciada', cor: '#A4402F' },
  em_andamento: { rotulo: 'em andamento', cor: '#B4703A' },
  parcial: { rotulo: 'parcial', cor: '#B8963E' },
  concluida: { rotulo: 'concluída', cor: '#3E5C4B' },
}

export function Planejamento() {
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [resumo, setResumo] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<
    'todas' | 'produzir' | 'esmaltar' | 'comprar' | 'queimar' | 'fotografar' | 'encomenda'
  >('todas')
  const [abrindo, setAbrindo] = useState<string | null>(null)

  const recarregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const { data } = await api.get('/planejamento')
      setSugestoes(data.sugestoes)
      setResumo(data.resumo)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para calcular o planejamento.'))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  useAutoRefresh(useCallback(() => void recarregar(true), [recarregar]))

  const abrirLote = async (s: Sugestao) => {
    if (!s.pecaId) return
    setAbrindo(s.titulo)
    try {
      const { data } = await api.post('/lotes', {
        pecaId: s.pecaId,
        quantidade: s.quantidade,
        origem: s.encomendaId ? 'encomenda' : 'planejamento',
        encomendaId: s.encomendaId ?? null,
        observacao: s.titulo,
      })
      avisar.ok(`Lote ${data.codigo} aberto a partir do planejamento.`)
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para abrir o lote.'))
    } finally {
      setAbrindo(null)
    }
  }

  if (carregando) return <Carregando texto="Cruzando mínimos, biscoito e produção…" />

  const visiveis = filtro === 'todas' ? sugestoes : sugestoes.filter((s) => s.tipo === filtro)

  return (
    <>
      <CabecalhoPagina
        titulo="Planejamento"
        descricao="O que vale a pena produzir agora, considerando o que já existe e o que já está a caminho."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          ['Tudo', resumo.total ?? 0, 'todas'],
          ['Encomenda', resumo.encomenda ?? 0, 'encomenda'],
          ['Produzir', resumo.produzir ?? 0, 'produzir'],
          ['Esmaltar', resumo.esmaltar ?? 0, 'esmaltar'],
          ['Queimar', resumo.queimar ?? 0, 'queimar'],
          ['Fotografar', resumo.fotografar ?? 0, 'fotografar'],
          ['Comprar', resumo.comprar ?? 0, 'comprar'],
        ].map(([rotulo, valor, chave]) => (
          <button
            key={String(chave)}
            onClick={() => setFiltro(chave as typeof filtro)}
            className={`rounded-2xl border p-4 text-left shadow-baixa transition-all duration-200 ${
              filtro === chave
                ? 'border-marca bg-marca/10 shadow-media'
                : 'border-borda bg-superficie hover:-translate-y-0.5 hover:border-marca-clara hover:shadow-media'
            }`}
          >
            <p className="font-titulo text-[1.75rem] leading-none text-tinta">{valor}</p>
            <p className="mt-1.5 text-sm text-tinta-fraca">{rotulo}</p>
          </button>
        ))}
      </div>

      {(resumo.urgentes ?? 0) > 0 && (
        <p className="mb-4 rounded-xl border border-perigo/30 bg-perigo/5 px-4 py-3 text-sm leading-relaxed text-tinta">
          <strong className="text-perigo">{resumo.urgentes}</strong>{' '}
          {formaPlural(resumo.urgentes ?? 0, 'item')} urgente
          {(resumo.urgentes ?? 0) === 1 ? '' : 's'} — encomenda com prazo, peça sem nenhuma pronta, ou
          cobertura que acaba antes da reposição chegar.
        </p>
      )}

      {visiveis.length === 0 ? (
        <Vazio
          icone={<Hammer size={22} />}
          titulo="Nada a sugerir agora"
          descricao="Ou os mínimos desejados estão atendidos, ou as peças ainda não têm mínimo cadastrado. O planejamento só fala quando tem o que dizer."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {visiveis.map((s, i) => {
            const Icone = ICONE[s.tipo]
            const situacao = SITUACAO[s.situacao] ?? SITUACAO.nao_iniciada
            return (
              <Card
                key={`${s.titulo}-${i}`}
                interativo
                className="anima-surgir flex flex-col gap-3 sm:flex-row sm:items-center"
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
                  style={{
                    backgroundColor: s.prioridade <= 1 ? '#A4402F22' : '#BBA58C22',
                    color: s.prioridade <= 1 ? '#A4402F' : '#6A6060',
                  }}
                >
                  <Icone size={20} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium text-tinta">{s.titulo}</h2>
                    {s.corHex && (
                      <span
                        className="inline-block h-4 w-4 rounded-full border border-borda"
                        style={{ backgroundColor: s.corHex }}
                        title={s.corNome}
                      />
                    )}
                    <Etiqueta cor={situacao.cor}>{situacao.rotulo}</Etiqueta>
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-tinta-fraca">{s.detalhe}</p>
                  <p className="text-xs text-tinta-fraca">
                    {s.situacaoDetalhe}
                    {s.previsao && ` · fica pronto em ${s.previsao}`}
                  </p>
                  {/* a perda é o motivo de o número sugerido ser maior que o que falta */}
                  {s.ajustePerda && (
                    <p className="mt-1 text-xs text-alerta">
                      Começar {s.ajustePerda.comecar} para entregar {s.ajustePerda.entregar}: a perda{' '}
                      {s.ajustePerda.origem === 'medida' ? 'medida' : 'estimada'} desta peça é{' '}
                      {String(s.ajustePerda.percentual).replace('.', ',')}%.
                    </p>
                  )}
                </div>

                {/* cada tipo leva ao lugar onde a ação acontece: fotografar não
                    abre lote, e queimar acontece na tela do forno */}
                {s.tipo === 'fotografar' ? (
                  <Link
                    to="/fotos"
                    className="shrink-0 rounded-xl border border-borda bg-superficie px-3.5 py-2 text-sm text-tinta transition hover:border-marca-clara"
                  >
                    Ir para as fotos
                  </Link>
                ) : s.tipo === 'queimar' ? (
                  <Link
                    to="/forno"
                    className="shrink-0 rounded-xl border border-borda bg-superficie px-3.5 py-2 text-sm text-tinta transition hover:border-marca-clara"
                  >
                    Ir para o forno
                  </Link>
                ) : s.tipo === 'comprar' ? (
                  <Link
                    to="/materias-primas"
                    className="shrink-0 rounded-xl border border-borda bg-superficie px-3.5 py-2 text-sm text-tinta transition hover:border-marca-clara"
                  >
                    Ver o insumo
                  </Link>
                ) : (
                  s.pecaId && (
                    <Botao
                      variante="secundario"
                      onClick={() => abrirLote(s)}
                      disabled={abrindo === s.titulo}
                      className="shrink-0"
                    >
                      {abrindo === s.titulo ? 'Abrindo…' : `Abrir lote de ${s.quantidade}`}
                    </Botao>
                  )
                )}
              </Card>
            )
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-tinta-fraca">
        A situação de cada item é derivada dos lotes existentes — ninguém precisa marcar nada como feito. O
        biscoito é repartido entre as cores com saldo corrente: a mesma peça em estoque não é prometida duas
        vezes, e o que não cobre vira sugestão de produzir do começo. A quantidade já vem inflada pela perda,
        porque começar exatamente o que falta entrega sempre a menos.
      </p>
    </>
  )
}
