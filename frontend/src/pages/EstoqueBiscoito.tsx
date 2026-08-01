import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Layers, TriangleAlert } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { avisar } from '../components/Toaster'
import { plural } from '../lib/format'
import { CabecalhoPagina, Card, Carregando, Etiqueta, Vazio } from '../components/ui'

/*
 * O PULMÃO DO ATELIÊ.
 *
 * Biscoito é peça queimada uma vez e ainda SEM cor: ela pode virar qualquer
 * esmalte. É o que permite atender uma cor que saiu bem sem recomeçar do torno
 * — trinta dias de diferença, na prática.
 *
 * Esta tela é a VISÃO desse saldo, não um lugar novo. Mandar peça para o
 * estoque é mover o lote da 1ª queima para a etapa de biscoito, e isso o quadro
 * já faz; aqui não há nada para escrever, só o que decidir.
 *
 * Por isso a ordem não é alfabética: quem está mais longe do mínimo abre a
 * lista. Numa tela ordenada por nome, a peça zerada dorme lá embaixo enquanto
 * a que está sobrando ocupa a primeira dobra do celular.
 */

type LinhaBiscoito = {
  pecaId: string
  peca: string
  categoria: string | null
  emBiscoito: number
  minimo: number
  aCaminho: number
  lotes: number
  faltam: number
  abaixoDoMinimo: boolean
  semMinimo: boolean
  percentualDoMinimo: number | null
  cobertoPeloQueVem: boolean
}

type ResumoBiscoito = {
  pecas: number
  emBiscoito: number
  aCaminho: number
  abaixoDoMinimo: number
  faltamNoTotal: number
  semMinimo: number
}

type Filtro = 'todas' | 'abaixo' | 'sem-minimo'

const VAZIO: ResumoBiscoito = {
  pecas: 0,
  emBiscoito: 0,
  aCaminho: 0,
  abaixoDoMinimo: 0,
  faltamNoTotal: 0,
  semMinimo: 0,
}

const COR_ZERADA = '#a4402f'
const COR_FALTANDO = '#a66836'
const COR_ATENDIDA = '#3e5c4b'
const COR_NEUTRA = '#8a807c'

/** Link com cara de botão — mesmo alvo de toque dos botões da casa. */
function LinkDeAcao({ para, children }: { para: string; children: React.ReactNode }) {
  return (
    <Link
      to={para}
      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-borda
        bg-superficie px-3.5 py-2.5 text-sm text-tinta transition hover:border-marca-clara hover:bg-superficie-2"
    >
      {children}
    </Link>
  )
}

function BarraDoMinimo({ percentual }: { percentual: number }) {
  const tom = percentual >= 100 ? 'bg-verde' : percentual >= 50 ? 'bg-alerta' : 'bg-perigo'
  return (
    <div
      className="mt-2 h-2 w-full overflow-hidden rounded-full bg-superficie-2"
      role="img"
      aria-label={`${percentual}% do mínimo`}
    >
      <div className={`h-full rounded-full ${tom}`} style={{ width: `${Math.min(100, percentual)}%` }} />
    </div>
  )
}

export function EstoqueBiscoito() {
  const [linhas, setLinhas] = useState<LinhaBiscoito[]>([])
  const [resumo, setResumo] = useState<ResumoBiscoito>(VAZIO)
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('todas')

  const recarregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const { data } = await api.get('/estoque/biscoito')
      setLinhas(data.linhas)
      setResumo(data.resumo)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para carregar o estoque de biscoito.'))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])
  useAutoRefresh(useCallback(() => void recarregar(true), [recarregar]))

  if (carregando) return <Carregando texto="Somando o biscoito parado…" />

  const visiveis = linhas.filter((l) =>
    filtro === 'abaixo' ? l.abaixoDoMinimo : filtro === 'sem-minimo' ? l.semMinimo : true,
  )

  const cartoes: { chave: Filtro; rotulo: string; valor: number }[] = [
    { chave: 'todas', rotulo: 'peças em biscoito', valor: resumo.emBiscoito },
    { chave: 'abaixo', rotulo: 'abaixo do mínimo', valor: resumo.abaixoDoMinimo },
    { chave: 'sem-minimo', rotulo: 'sem mínimo definido', valor: resumo.semMinimo },
  ]

  return (
    <>
      <CabecalhoPagina
        titulo="Estoque de biscoito"
        descricao="Peça queimada uma vez e ainda sem cor. É o pulmão: daqui sai qualquer esmalte sem começar do torno."
        acoes={
          <>
            <LinkDeAcao para="/planejamento">
              Planejamento <ArrowRight size={15} />
            </LinkDeAcao>
            <LinkDeAcao para="/producao">Quadro</LinkDeAcao>
          </>
        }
      />

      {resumo.abaixoDoMinimo > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-alerta/30 bg-alerta/5 px-4 py-3 text-sm leading-relaxed text-tinta">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-alerta" />
          <span>
            <strong className="text-alerta">
              {plural(resumo.abaixoDoMinimo, 'peça')} abaixo do mínimo de biscoito
            </strong>
            , somando {plural(resumo.faltamNoTotal, 'peça')} que faltam. Enquanto o pulmão está vazio,
            toda cor que vender bem depende de começar do torno.
            {resumo.aCaminho > 0 &&
              ` Há ${plural(resumo.aCaminho, 'peça')} a caminho do biscoito na produção — parte disso pode já resolver.`}
          </span>
        </p>
      )}

      <div className="mb-4 grid grid-cols-3 gap-2">
        {cartoes.map((c) => (
          <button
            key={c.chave}
            onClick={() => setFiltro(filtro === c.chave ? 'todas' : c.chave)}
            className={`rounded-2xl border p-3 text-left transition-all duration-200 ${
              filtro === c.chave
                ? 'border-marca bg-marca/10 shadow-media'
                : 'border-borda bg-superficie hover:-translate-y-0.5 hover:border-marca-clara'
            }`}
          >
            <p className="font-titulo text-2xl leading-none text-tinta">{c.valor}</p>
            <p className="mt-1 text-xs leading-snug text-tinta-fraca">{c.rotulo}</p>
          </button>
        ))}
      </div>

      {linhas.length === 0 ? (
        <Vazio
          icone={<Layers size={22} />}
          titulo="Nenhuma peça passa por biscoito"
          descricao="Biscoito é a peça já queimada uma vez e ainda sem cor — o pulmão que atende uma cor que saiu bem sem recomeçar do torno. Para uma peça aparecer aqui, o roteiro dela precisa passar por uma etapa marcada como estoque intermediário."
          acao={<LinkDeAcao para="/etapas">Ver as etapas</LinkDeAcao>}
        />
      ) : visiveis.length === 0 ? (
        <Vazio
          icone={<Layers size={22} />}
          titulo={filtro === 'abaixo' ? 'Nenhuma peça abaixo do mínimo' : 'Toda peça tem mínimo definido'}
          descricao={
            filtro === 'abaixo'
              ? 'O pulmão está cheio: qualquer cor que vender bem pode ser esmaltada sem começar do torno.'
              : 'Cada peça que passa por biscoito já tem um mínimo desejado, e é ele que faz o planejamento avisar quando o pulmão baixa.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {visiveis.map((l) => {
            const zerada = l.emBiscoito === 0 && !l.semMinimo
            return (
              <Card key={l.pecaId} className="anima-surgir flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium text-tinta">{l.peca}</h2>
                    {l.categoria && <Etiqueta cor={COR_NEUTRA}>{l.categoria}</Etiqueta>}
                    {l.semMinimo ? (
                      <Etiqueta cor={COR_NEUTRA}>sem mínimo</Etiqueta>
                    ) : l.abaixoDoMinimo ? (
                      <Etiqueta cor={zerada ? COR_ZERADA : COR_FALTANDO}>
                        {zerada ? 'zerado' : `faltam ${l.faltam}`}
                      </Etiqueta>
                    ) : (
                      <Etiqueta cor={COR_ATENDIDA}>no mínimo</Etiqueta>
                    )}
                  </div>

                  <p className="mt-0.5 text-sm text-tinta-fraca">
                    <strong className="font-medium text-tinta">{l.emBiscoito}</strong> em biscoito
                    {l.semMinimo ? ' · sem mínimo definido' : ` · mínimo ${l.minimo}`}
                    {l.lotes > 0 && ` · em ${plural(l.lotes, 'lote')}`}
                    {l.aCaminho > 0 && ` · ${l.aCaminho} a caminho do biscoito`}
                  </p>

                  {l.percentualDoMinimo !== null && <BarraDoMinimo percentual={l.percentualDoMinimo} />}

                  {l.semMinimo && (
                    <p className="mt-1 text-xs leading-relaxed text-tinta-fraca">
                      Sem mínimo em biscoito, o planejamento não tem como avisar que o pulmão desta peça
                      baixou — ele só reage quando a peça pronta acaba.
                    </p>
                  )}
                  {l.cobertoPeloQueVem && (
                    <p className="mt-1 text-xs leading-relaxed text-verde">
                      As {l.aCaminho} que já estão a caminho fecham essa conta sozinhas — dá para esperar
                      a próxima queima em vez de começar do torno.
                    </p>
                  )}
                </div>

                {/* o lote não é aberto aqui de propósito: quem sabe inflar a
                    quantidade pela perda é o planejamento */}
                {l.semMinimo ? (
                  <LinkDeAcao para="/pecas">Definir mínimo</LinkDeAcao>
                ) : l.abaixoDoMinimo ? (
                  <LinkDeAcao para="/planejamento">
                    Repor no planejamento <ArrowRight size={15} />
                  </LinkDeAcao>
                ) : (
                  <LinkDeAcao para="/producao">Ver no quadro</LinkDeAcao>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-tinta-fraca">
        O saldo é a soma do livro-razão, não um campo: mover o lote da 1ª queima para a etapa de biscoito,
        no quadro, é o que o faz aparecer aqui. Lote que já escolheu esmalte não conta como pulmão — ele
        tem dono e vai virar aquela cor. E o número sugerido de reposição sai do planejamento, que infla a
        quantidade pela perda: começar exatamente o que falta entrega sempre a menos.
      </p>
    </>
  )
}
