import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Camera, MinusCircle, PackageCheck } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { avisar } from '../components/Toaster'
import { formaPlural, plural } from '../lib/format'
import {
  Botao,
  CabecalhoPagina,
  Campo,
  Card,
  Carregando,
  ChipCor,
  Etiqueta,
  Input,
  Modal,
  Select,
  Textarea,
  Vazio,
} from '../components/ui'
import { MOTIVOS_DE_SAIDA, ajudaDaSaida } from '../lib/saida-estoque'
import { enviarComFila } from '../lib/filaOffline'

/*
 * O FIM DA LINHA — e a distinção que esta tela existe para não deixar sumir.
 *
 * Peça pronta é a que passou por tudo, inclusive esmaltação e 2ª queima. Mas
 * PRONTO NÃO É VENDÁVEL: sem foto publicada da combinação peça+esmalte, a peça
 * está na prateleira e não está na loja.
 *
 * Mostrar um total só juntaria as duas coisas e mentiria na direção mais cara:
 * a Vera leria "40 prontas", deixaria de produzir, e a loja continuaria sem
 * nada para vender. Por isso a tela sempre separa três números — pronto,
 * vendável e travado — e a lista abre pelo que está travado, que é dinheiro
 * parado a uma foto de distância.
 *
 * A granularidade é peça + esmalte porque aqui a cor já existe: o Bowl não
 * vende, o Bowl Pistache vende.
 */

type LinhaPronta = {
  pecaId: string
  peca: string
  corId: string | null
  cor: string | null
  corHex: string | null
  malhado: boolean
  amostraUrl: string | null
  prontas: number
  aCaminho: number
  vendaveis: number
  travadas: number
  fotoStatus: string | null
  situacao: 'vendavel' | 'sem_foto' | 'sem_esmalte'
}

type GrupoPronta = {
  pecaId: string
  peca: string
  prontas: number
  vendaveis: number
  travadas: number
  semEsmalte: number
  aCaminho: number
  linhas: LinhaPronta[]
}

type ResumoProntas = {
  pecas: number
  combinacoes: number
  prontas: number
  vendaveis: number
  travadas: number
  combinacoesTravadas: number
  semEsmalte: number
}

type Filtro = 'todas' | 'vendaveis' | 'travadas'

const VAZIO: ResumoProntas = {
  pecas: 0,
  combinacoes: 0,
  prontas: 0,
  vendaveis: 0,
  travadas: 0,
  combinacoesTravadas: 0,
  semEsmalte: 0,
}

const COR_TRAVADA = '#a4402f'
const COR_SEM_ESMALTE = '#a66836'
const COR_VENDAVEL = '#3e5c4b'

/** Onde o ciclo da foto parou, dito como a Gabi fala. */
const ONDE_PAROU: Record<string, string> = {
  pendente: 'nunca foi fotografada',
  fotografado: 'fotografada, falta enviar',
  enviado: 'está com a Gabi',
  editado: 'editada, falta publicar',
}

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

/*
 * A BAIXA, ONDE A PEÇA DE FATO SAI.
 *
 * A pessoa diz quantas e por quê. Não diz de qual lote: quem embala o pedido
 * sabe que saiu um BOWL PISTACHE, não que ele veio do L-0031 — as peças estão
 * todas na mesma prateleira. O servidor reparte pelos lotes mais antigos.
 */
function ModalBaixa({
  linha,
  peca,
  aoFechar,
  aoConcluir,
}: {
  linha: LinhaPronta
  peca: string
  aoFechar: () => void
  aoConcluir: () => void
}) {
  const [quantidade, setQuantidade] = useState('1')
  const [motivoTipo, setMotivoTipo] = useState('venda')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  const motivo = MOTIVOS_DE_SAIDA.find((m) => m.valor === motivoTipo)
  const eDevolucao = motivo?.sentido === 'entrada'
  const n = Number(quantidade)
  const invalida = !Number.isInteger(n) || n < 1
  // devolução não é limitada pelo saldo: ela devolve o que SAIU
  const passaDoEstoque = !eDevolucao && n > linha.prontas

  const confirmar = async () => {
    setSalvando(true)
    try {
      /*
       * PELA FILA, como toda escrita de produção.
       *
       * O ateliê tem sinal ruim e a baixa é dada com a peça na mão, embalando.
       * `api.post` cru perderia o registro quando a resposta não voltasse — e a
       * chave gerada a cada tentativa não protegeria nada, porque cada reenvio
       * traria uma chave nova. A fila guarda a chave junto com o pedido.
       */
      const enviado = await enviarComFila(
        'post',
        '/estoque/prontas/baixa',
        { pecaId: linha.pecaId, corId: linha.corId, quantidade: n, motivoTipo, observacao },
        `Baixa de ${n} ${peca}${linha.cor ? ` ${linha.cor}` : ''}`,
      )
      if (enviado.enfileirado) {
        avisar.info('Sem sinal agora — a baixa está guardada e sobe sozinha quando a conexão voltar.')
        aoConcluir()
        return
      }
      const data = enviado.dados as {
        baixado: number
        aviso: string | null
        fatias?: { codigo: string; quantidade: number }[]
      }
      const onde = data.fatias?.length
        ? ` (${data.fatias.map((f: { codigo: string; quantidade: number }) => `${f.codigo}: ${f.quantidade}`).join(', ')})`
        : ''
      if (data.baixado > 0) {
        avisar.ok(`${eDevolucao ? 'Devolvidas' : 'Baixadas'} ${data.baixado} de ${peca}${onde}.`)
      }
      if (data.aviso) avisar.info(data.aviso)
      aoConcluir()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para dar baixa.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`Baixa de ${peca}`}
      descricao={linha.cor ? `Esmalte ${linha.cor} · ${linha.prontas} prontas` : `Sem esmalte · ${linha.prontas} prontas`}
      largura="max-w-lg"
      fecharClicandoFora={false}
    >
      <div className="flex flex-col gap-4">
        <Campo rotulo="Motivo" dica={ajudaDaSaida(motivoTipo)}>
          <Select value={motivoTipo} onChange={(e) => setMotivoTipo(e.target.value)}>
            {MOTIVOS_DE_SAIDA.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.rotulo}
              </option>
            ))}
          </Select>
        </Campo>

        <Campo
          rotulo="Quantas"
          erro={
            passaDoEstoque
              ? `Só há ${linha.prontas} desta combinação no estoque de prontas.`
              : undefined
          }
        >
          <Input
            type="number"
            min={1}
            max={eDevolucao ? undefined : linha.prontas}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </Campo>

        <Campo rotulo="Observação" dica="Opcional. Vai para o histórico do lote.">
          <Textarea
            rows={2}
            maxLength={300}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </Campo>

        {motivoTipo === 'venda' && (
          <p className="rounded-lg bg-superficie-2 p-3 text-xs leading-relaxed text-tinta-fraca">
            Se esta venda também for lançada em Vendas, o registro de lá já dá a baixa sozinho — não
            precisa fazer as duas coisas.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao onClick={confirmar} disabled={salvando || invalida || passaDoEstoque}>
            {salvando ? 'Registrando…' : eDevolucao ? 'Devolver ao estoque' : 'Dar baixa'}
          </Botao>
        </div>
      </div>
    </Modal>
  )
}

export function EstoqueProntas() {
  const [baixa, setBaixa] = useState<{ linha: LinhaPronta; peca: string } | null>(null)
  const [grupos, setGrupos] = useState<GrupoPronta[]>([])
  const [resumo, setResumo] = useState<ResumoProntas>(VAZIO)
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('todas')

  const recarregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const { data } = await api.get('/estoque/prontas')
      setGrupos(data.grupos)
      setResumo(data.resumo)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para carregar o estoque de peças prontas.'))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])
  useAutoRefresh(useCallback(() => void recarregar(true), [recarregar]))

  if (carregando) return <Carregando texto="Separando o que está pronto do que já pode vender…" />

  // o filtro corta as LINHAS, não só os cartões: pedir "travadas" e receber a
  // peça inteira com as cores que já vendem obrigaria a procurar de novo
  const visiveis = grupos
    .map((g) => ({
      ...g,
      linhas: g.linhas.filter((l) =>
        filtro === 'travadas' ? l.travadas > 0 : filtro === 'vendaveis' ? l.vendaveis > 0 : true,
      ),
    }))
    .filter((g) => g.linhas.length > 0)

  const cartoes: { chave: Filtro; rotulo: string; valor: number }[] = [
    { chave: 'todas', rotulo: 'peças finalizadas', valor: resumo.prontas },
    { chave: 'vendaveis', rotulo: 'com foto publicada', valor: resumo.vendaveis },
    { chave: 'travadas', rotulo: 'travadas por foto', valor: resumo.travadas },
  ]

  return (
    <>
      <CabecalhoPagina
        titulo="Peças prontas"
        descricao="O que já passou por todos os processos, inclusive esmaltação e 2ª queima. Pronto e vendável não são o mesmo número — e nenhum dos dois desconta o que já foi vendido."
        acoes={
          <LinkDeAcao para="/fotos">
            Fila de fotos <ArrowRight size={15} />
          </LinkDeAcao>
        }
      />

      {resumo.travadas > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-perigo/30 bg-perigo/5 px-4 py-3 text-sm leading-relaxed text-tinta">
          <PackageCheck size={17} className="mt-0.5 shrink-0 text-perigo" />
          <span>
            <strong className="text-perigo">
              {plural(resumo.travadas, 'peça')} {formaPlural(resumo.travadas, 'pronta')}
            </strong>{' '}
            não podem ir para a loja porque a combinação ainda não tem foto publicada —{' '}
            {plural(resumo.combinacoesTravadas, 'combinação')} de peça e esmalte. Elas contam como
            estoque, mas não como venda possível.
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

      {grupos.length === 0 ? (
        <Vazio
          icone={<PackageCheck size={22} />}
          titulo="Nenhuma peça pronta no estoque"
          descricao="Aqui aparece o que já passou por todos os processos, peça por esmalte. Enquanto os lotes não chegam à etapa final, o estoque pronto é zero — e o quadro de produção mostra onde cada um está."
          acao={<LinkDeAcao para="/producao">Ver o quadro</LinkDeAcao>}
        />
      ) : visiveis.length === 0 ? (
        <Vazio
          icone={filtro === 'travadas' ? <Camera size={22} /> : <PackageCheck size={22} />}
          titulo={filtro === 'travadas' ? 'Nada travado por foto' : 'Nada vendável ainda'}
          descricao={
            filtro === 'travadas'
              ? 'Toda combinação com peça pronta já está publicada na loja. É o estado que a loja quer.'
              : 'Existe peça pronta, mas nenhuma combinação está publicada. Sem foto na loja, o estoque não vira venda.'
          }
          acao={filtro === 'vendaveis' ? <LinkDeAcao para="/fotos">Ir para as fotos</LinkDeAcao> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {visiveis.map((g) => (
            <Card key={g.pecaId} className="anima-surgir">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="font-medium text-tinta">{g.peca}</h2>
                <p className="text-sm text-tinta-fraca">
                  <strong className="font-medium text-tinta">{g.prontas}</strong>{' '}
                  {formaPlural(g.prontas, 'pronta')} ·{' '}
                  <span className="text-verde">
                    {g.vendaveis} {formaPlural(g.vendaveis, 'vendável', 'vendáveis')}
                  </span>
                  {g.travadas > 0 && (
                    <span className="text-perigo">
                      {' '}
                      · {g.travadas} {formaPlural(g.travadas, 'travada')}
                    </span>
                  )}
                  {g.aCaminho > 0 && ` · ${g.aCaminho} a caminho`}
                </p>
              </div>

              <ul className="mt-3 flex flex-col">
                {g.linhas.map((l) => (
                  <li
                    key={l.corId ?? 'sem-esmalte'}
                    className="flex flex-col gap-2 border-t border-borda py-3 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {l.corId ? (
                          <ChipCor
                            nome={l.cor ?? 'esmalte não identificado'}
                            hex={l.corHex ?? '#CCCCCC'}
                            amostraUrl={l.amostraUrl}
                            malhado={l.malhado}
                            tamanho={16}
                          />
                        ) : (
                          <span className="text-sm text-tinta">Sem esmalte definido</span>
                        )}
                        {l.situacao === 'vendavel' && <Etiqueta cor={COR_VENDAVEL}>na loja</Etiqueta>}
                        {l.situacao === 'sem_foto' && (
                          <Etiqueta cor={COR_TRAVADA}>
                            {l.prontas} {formaPlural(l.prontas, 'travada')}
                          </Etiqueta>
                        )}
                        {l.situacao === 'sem_esmalte' && (
                          <Etiqueta cor={COR_SEM_ESMALTE}>sem cor</Etiqueta>
                        )}
                      </div>

                      <p className="mt-0.5 text-sm text-tinta-fraca">
                        {plural(l.prontas, 'peça')} {formaPlural(l.prontas, 'pronta')}
                        {l.aCaminho > 0 && ` · ${l.aCaminho} a caminho`}
                        {l.situacao === 'vendavel' && ' · foto publicada, pode ser anunciada'}
                        {l.situacao === 'sem_foto' &&
                          ` · ${l.fotoStatus === null ? 'combinação sem ciclo de foto cadastrado' : (ONDE_PAROU[l.fotoStatus] ?? `ciclo parado em "${l.fotoStatus}"`)}`}
                        {l.situacao === 'sem_esmalte' &&
                          ' · o lote chegou ao fim sem esmalte atribuído; sem cor não há foto nem anúncio'}
                      </p>
                    </div>

                    {l.situacao === 'sem_foto' && (
                      <LinkDeAcao para="/fotos">
                        Ir para as fotos <ArrowRight size={15} />
                      </LinkDeAcao>
                    )}
                    {l.situacao === 'sem_esmalte' && <LinkDeAcao para="/historico">Ver os lotes</LinkDeAcao>}
                    {l.prontas > 0 && (
                      <Botao
                        variante="secundario"
                        className="shrink-0"
                        onClick={() => setBaixa({ linha: l, peca: g.peca })}
                      >
                        <MinusCircle size={15} /> Dar baixa
                      </Botao>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {baixa && (
        <ModalBaixa
          linha={baixa.linha}
          peca={baixa.peca}
          aoFechar={() => setBaixa(null)}
          aoConcluir={() => {
            setBaixa(null)
            void recarregar(true)
          }}
        />
      )}

      <p className="mt-6 text-xs leading-relaxed text-tinta-fraca">
        Vendável é a peça cuja combinação de peça e esmalte tem foto publicada — o ciclo mora em peça+cor,
        não no lote, porque um Bowl Pistache fotografado uma vez serve toda fornada futura.{' '}
        <strong className="text-tinta">Este número já desconta o que saiu.</strong> A baixa sai do lote
        mais antigo primeiro, e registrar uma venda em Vendas já dá baixa sozinha — fazer as duas coisas
        tiraria a peça em dobro. Peça que saiu por venda, feira, brinde ou uso do ateliê NÃO entra na taxa
        de perda; só a que quebrou depois de pronta entra, porque essa quebrou mesmo.
      </p>
    </>
  )
}
