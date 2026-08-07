import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RotateCcw, Trash2, Upload, TrendingDown } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { avisar } from '../components/Toaster'
import {
  Botao,
  CabecalhoPagina,
  Campo,
  Card,
  Carregando,
  Etiqueta,
  ChipCor,
  InputNumero,
  Modal,
  Select,
  Textarea,
  Vazio,
} from '../components/ui'

/*
 * PRODUÇÃO versus VENDA — a tela que o briefing pedia e não existia.
 *
 * Sem venda, `qtdMinimaDesejada` era um chute que a Vera dava uma vez e nunca
 * revisava, e todo o planejamento pendia dele. O sistema respondia "estou
 * fazendo o que eu disse?" mas não "estou fazendo as coisas certas?".
 *
 * O número que resolve é a COBERTURA: quantas semanas o estoque aguenta no
 * ritmo em que a peça sai. Comparada com o tempo de repor, vira alarme.
 */

type Linha = {
  pecaId: string
  peca: string
  prontas: number
  emProducao: number
  biscoito: number
  minimoAtual: number
  minimoSugerido: number | null
  semanasParaRepor: number
  cobertura: {
    semanas: number | null
    porSemana: number
    vaiFaltar: boolean
    explicacao: string
  }
  meses: { competencia: string; vendido: number; produzido: number }[]
}

/** Barras de vendido vs. produzido nos últimos 6 meses fechados. */
function MiniGrafico({ meses }: { meses: Linha['meses'] }) {
  const maior = Math.max(1, ...meses.flatMap((m) => [m.vendido, m.produzido]))
  return (
    <div className="flex items-end gap-1.5">
      {meses.map((m) => (
        <div key={m.competencia} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-12 w-full items-end justify-center gap-0.5">
            <div
              className="w-1/2 rounded-t bg-marca transition-all"
              style={{ height: `${(m.produzido / maior) * 100}%` }}
              title={`Produzido em ${m.competencia}: ${m.produzido}`}
            />
            <div
              className="w-1/2 rounded-t bg-verde transition-all"
              style={{ height: `${(m.vendido / maior) * 100}%` }}
              title={`Vendido em ${m.competencia}: ${m.vendido}`}
            />
          </div>
          <span className="text-[10px] text-tinta-fraca">{m.competencia.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}

type VendaLancada = {
  id: string
  competencia: string
  quantidade: number
  devolvidas: number
  peca: { id: string; nome: string }
  cor: { id: string; nome: string; hex: string } | null
  canal: { id: string; nome: string } | null
}

/*
 * AS VENDAS LANÇADAS, uma a uma.
 *
 * Esta lista não existia: a tela só mostrava o comparativo e a importação, e
 * não havia como olhar — muito menos corrigir — uma venda específica. Faltando
 * ela, "o cliente devolveu" não tinha onde ser registrado, e apagar uma venda
 * lançada errado só era possível pela API.
 */
function ListaDeVendas({
  vendas,
  aoDevolver,
  aoApagar,
}: {
  vendas: VendaLancada[]
  aoDevolver: (v: VendaLancada) => void
  aoApagar: (v: VendaLancada) => void
}) {
  if (vendas.length === 0) {
    return (
      <p className="rounded-xl border border-borda bg-superficie px-4 py-6 text-center text-sm text-tinta-fraca">
        Nenhuma venda lançada ainda. Importe a planilha do marketplace para começar.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {vendas.map((v) => {
        const liquido = Math.max(0, v.quantidade - v.devolvidas)
        return (
          <Card key={v.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-tinta">{v.peca.nome}</h3>
                {v.cor && <ChipCor nome={v.cor.nome} hex={v.cor.hex} tamanho={14} />}
                <Etiqueta cor="#8a807c">{v.competencia}</Etiqueta>
                {v.canal && <span className="text-xs text-tinta-fraca">{v.canal.nome}</span>}
              </div>
              <p className="mt-0.5 text-sm text-tinta-fraca">
                {v.devolvidas > 0 ? (
                  <>
                    <strong className="text-tinta">{liquido}</strong> líquidas · {v.quantidade}{' '}
                    vendidas, {v.devolvidas} devolvidas
                  </>
                ) : (
                  <>
                    <strong className="text-tinta">{v.quantidade}</strong> vendidas
                  </>
                )}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5">
              {liquido > 0 && (
                <Botao variante="secundario" onClick={() => aoDevolver(v)}>
                  <RotateCcw size={15} /> Devolvida
                </Botao>
              )}
              <Botao variante="secundario" onClick={() => aoApagar(v)}>
                <Trash2 size={15} /> Apagar
              </Botao>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

export function Vendas() {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [importarAberto, setImportarAberto] = useState(false)
  const [conteudo, setConteudo] = useState('')
  const [canalId, setCanalId] = useState('')
  const [canais, setCanais] = useState<{ id: string; nome: string }[]>([])
  const [enviando, setEnviando] = useState(false)
  const [vendas, setVendas] = useState<VendaLancada[]>([])
  const [devolvendo, setDevolvendo] = useState<VendaLancada | null>(null)
  const [quantosVoltam, setQuantosVoltam] = useState('1')
  const [apagando, setApagando] = useState<VendaLancada | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState<{
    importadas: number
    atualizadas: number
    naoReconhecidas: { peca: string; quantidade: number; competencia: string }[]
    erros: { linha: number; motivo: string }[]
    baixa: {
      baixado: number
      faltou: number
      semEstoque: { peca: string; cor: string | null; pedido: number; baixado: number }[]
    }
  } | null>(null)

  const recarregar = useCallback(async () => {
    try {
      const [c, ca, v] = await Promise.all([
        api.get('/vendas/comparativo'),
        api.get('/canais'),
        api.get('/vendas'),
      ])
      setLinhas(c.data.linhas)
      setCanais(ca.data)
      setVendas(v.data)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para carregar o comparativo.'))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  const lerArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    const leitor = new FileReader()
    leitor.onload = () => setConteudo(String(leitor.result ?? ''))
    // windows-1252 é o que o Excel brasileiro costuma salvar; utf-8 primeiro
    leitor.readAsText(arquivo, 'utf-8')
  }

  const importar = async () => {
    setEnviando(true)
    try {
      const { data } = await api.post('/vendas/importar', { conteudo, canalId: canalId || null })
      setResultado(data)
      avisar.ok(
        `${data.importadas} novas e ${data.atualizadas} atualizadas` +
          (data.baixa?.baixado ? ` · ${data.baixa.baixado} baixadas do estoque de prontas` : '') +
          '.',
      )
      /*
       * A venda importada dá baixa no estoque de prontas. Quando o estoque não
       * cobre, isso NÃO é erro — é peça feita antes de o sistema existir. Mas
       * precisa ser dito, senão a diferença entre o que a tela mostra e o que
       * está na prateleira volta a crescer em silêncio.
       */
      if (data.baixa?.faltou > 0) {
        avisar.info(
          `${data.baixa.faltou} peça(s) vendidas não tinham saldo no estoque de prontas — ` +
            'provavelmente feitas antes de o sistema existir. Confira a lista abaixo.',
        )
      }
      await recarregar()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para importar a planilha.'))
    } finally {
      setEnviando(false)
    }
  }

  const confirmarDevolucao = async () => {
    if (!devolvendo) return
    setSalvando(true)
    try {
      const { data } = await api.post(`/vendas/${devolvendo.id}/devolucao`, {
        quantidade: Number(quantosVoltam),
      })
      avisar.ok(
        `${data.baixa.baixado} peça(s) de volta ao estoque. A venda passa a valer ` +
          `${data.venda.quantidade - data.venda.devolvidas}.`,
      )
      if (data.baixa.aviso) avisar.info(data.baixa.aviso)
      setDevolvendo(null)
      await recarregar()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para registrar a devolução.'))
    } finally {
      setSalvando(false)
    }
  }

  const confirmarApagar = async () => {
    if (!apagando) return
    setSalvando(true)
    try {
      const { data } = await api.delete(`/vendas/${apagando.id}`)
      avisar.ok(
        data.devolvidas > 0
          ? `Venda apagada e ${data.devolvidas} peça(s) devolvidas ao estoque.`
          : 'Venda apagada.',
      )
      if (data.aviso) avisar.info(data.aviso)
      setApagando(null)
      await recarregar()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para apagar a venda.'))
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) return <Carregando texto="Cruzando venda com produção…" />

  const emRisco = linhas.filter((l) => l.cobertura.vaiFaltar)
  const restaDevolver = devolvendo ? devolvendo.quantidade - devolvendo.devolvidas : 0
  const quantosNum = Number(quantosVoltam)
  const devolucaoInvalida =
    !Number.isInteger(quantosNum) || quantosNum < 1 || quantosNum > restaDevolver

  return (
    <>
      <CabecalhoPagina
        titulo="Vendas e cobertura"
        descricao="Quanto cada peça sai por semana, quanto tempo o estoque aguenta e se a reposição chega a tempo."
        acoes={
          <Botao onClick={() => setImportarAberto(true)} className="col-span-2 justify-center sm:col-span-1">
            <Upload size={16} /> Importar planilha
          </Botao>
        }
      />

      {emRisco.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-perigo/30 bg-perigo/5 px-4 py-3 text-sm leading-relaxed text-tinta">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-perigo" />
          <span>
            <strong className="text-perigo">
              {emRisco.length} {emRisco.length === 1 ? 'peça vai faltar' : 'peças vão faltar'}
            </strong>{' '}
            — o estoque acaba antes de a reposição ficar pronta. É assim que a peça some da loja.
          </span>
        </p>
      )}

      {linhas.length === 0 ? (
        <Vazio
          icone={<TrendingDown size={22} />}
          titulo="Ainda não há venda registrada"
          descricao="Importe a planilha mensal do Mercado Livre ou da Shopee. Com um mês fechado já dá para calcular quanto cada peça sai por semana — e o mínimo desejado deixa de ser chute."
          acao={<Botao onClick={() => setImportarAberto(true)}>Importar planilha</Botao>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {linhas.map((l) => (
            <Card key={l.pecaId} className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium text-tinta">{l.peca}</h2>
                  {l.cobertura.vaiFaltar && <Etiqueta cor="#a4402f">vai faltar</Etiqueta>}
                  {l.cobertura.semanas !== null && !l.cobertura.vaiFaltar && (
                    <Etiqueta cor="#3e5c4b">
                      {l.cobertura.semanas.toFixed(1).replace('.', ',')} semanas
                    </Etiqueta>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-tinta-fraca">{l.cobertura.explicacao}</p>
                <p className="mt-1 text-xs text-tinta-fraca">
                  {l.prontas} pronta{l.prontas === 1 ? '' : 's'} · {l.emProducao} em produção ·{' '}
                  {l.biscoito} em biscoito · repor leva {l.semanasParaRepor}{' '}
                  {l.semanasParaRepor === 1 ? 'semana' : 'semanas'}
                </p>
              </div>

              <div className="w-full shrink-0 lg:w-56">
                <MiniGrafico meses={l.meses} />
                <p className="mt-1 text-center text-[10px] text-tinta-fraca">
                  <span className="text-marca">▮</span> produzido{' '}
                  <span className="text-verde">▮</span> vendido
                </p>
              </div>

              <div className="shrink-0 rounded-xl bg-superficie-2 px-3.5 py-2.5 text-center">
                <p className="font-titulo text-xl leading-none text-tinta">{l.minimoAtual}</p>
                <p className="mt-1 text-[11px] text-tinta-fraca">mínimo hoje</p>
                {l.minimoSugerido !== null && l.minimoSugerido !== l.minimoAtual && (
                  <p className="mt-1.5 border-t border-borda pt-1.5 text-[11px] text-marca">
                    a venda sugere {l.minimoSugerido}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-1 font-titulo text-xl text-tinta">Vendas lançadas</h2>
        <p className="mb-3 text-sm text-tinta-fraca">
          Uma linha por peça, esmalte, canal e mês. Cada venda aqui já deu baixa no estoque de peças
          prontas — se o cliente devolveu, é por aqui que a peça volta para a prateleira.
        </p>
        <ListaDeVendas
          vendas={vendas}
          aoDevolver={(v) => {
            setQuantosVoltam(String(Math.max(1, v.quantidade - v.devolvidas)))
            setDevolvendo(v)
          }}
          aoApagar={setApagando}
        />
      </div>

      <p className="mt-6 text-xs leading-relaxed text-tinta-fraca">
        A média ignora o mês corrente de propósito: no dia 3 ele tem 3 dias de venda e 27 de nada, e
        incluí-lo faria o sistema achar que a peça parou de vender. O mínimo sugerido cobre o tempo de
        reposição mais duas semanas de folga — sem folga, a peça chega a zero exatamente quando a
        reposição chega, e qualquer atraso vira prateleira vazia.
      </p>

      <Modal
        aberto={importarAberto}
        aoFechar={() => {
          setImportarAberto(false)
          setResultado(null)
        }}
        titulo="Importar planilha de vendas"
        descricao="Mercado Livre e Shopee exportam CSV. Serve qualquer planilha com uma coluna de peça, uma de quantidade e uma de mês."
        largura="max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <Campo rotulo="Canal" dica="Opcional — serve para separar de onde veio cada venda.">
            <Select value={canalId} onChange={(e) => setCanalId(e.target.value)}>
              <option value="">Sem canal específico</option>
              {canais.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Campo>

          <Campo rotulo="Arquivo CSV">
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={lerArquivo}
              className="w-full rounded-xl border border-borda bg-superficie px-3.5 py-2.5 text-sm text-tinta file:mr-3 file:rounded-lg file:border-0 file:bg-marca file:px-3 file:py-1.5 file:text-sm file:text-contraste"
            />
          </Campo>

          <Campo rotulo="Ou cole o conteúdo" dica="Dá para colar direto da planilha aberta.">
            <Textarea
              rows={6}
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              placeholder={'Produto;Cor;Mês;Quantidade\nBowl;Pistache;07/2026;12'}
            />
          </Campo>

          {resultado && (
            <div className="rounded-xl border border-borda bg-superficie-2 p-3.5 text-sm">
              <p className="text-tinta">
                {resultado.importadas} novas, {resultado.atualizadas} atualizadas.
                {resultado.baixa && resultado.baixa.baixado > 0 && (
                  <> {resultado.baixa.baixado} peça(s) baixadas do estoque de prontas.</>
                )}
              </p>

              {/*
                ESTOQUE QUE NÃO COBRIU A VENDA.
                Não é erro: é peça feita antes de o sistema existir, e por isso a
                importação não foi recusada. Mas tem de ser dito — em silêncio, a
                diferença entre a tela e a prateleira volta a crescer.
              */}
              {resultado.baixa?.semEstoque?.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-tinta">
                    {resultado.baixa.faltou} peça(s) vendidas sem saldo no estoque de prontas:
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs text-tinta-fraca">
                    {resultado.baixa.semEstoque.slice(0, 8).map((n, i) => (
                      <li key={i}>
                        {n.peca}
                        {n.cor ? ` · ${n.cor}` : ''} — vendidas {n.pedido}, baixadas {n.baixado}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-tinta-fraca">
                    A venda foi registrada assim mesmo: recusá-la trocaria um número impreciso por um
                    número que não existe. Isso é esperado para peça finalizada antes de o sistema
                    existir, e some sozinho conforme o estoque passa a ser todo dele.
                  </p>
                </div>
              )}
              {resultado.naoReconhecidas.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-alerta">
                    {resultado.naoReconhecidas.length} peça(s) não reconhecida(s):
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs text-tinta-fraca">
                    {resultado.naoReconhecidas.slice(0, 8).map((n, i) => (
                      <li key={i}>
                        {n.peca} — {n.quantidade} em {n.competencia}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-tinta-fraca">
                    Elas não viram cadastro sozinhas de propósito: cada variação de nome no anúncio
                    criaria uma peça nova. Cadastre a peça e importe de novo.
                  </p>
                </div>
              )}
              {resultado.erros.length > 0 && (
                <p className="mt-2 text-xs text-tinta-fraca">
                  {resultado.erros.length} linha(s) com problema — a primeira: linha{' '}
                  {resultado.erros[0].linha}, {resultado.erros[0].motivo}.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Botao variante="secundario" onClick={() => setImportarAberto(false)}>
              Fechar
            </Botao>
            <Botao onClick={importar} disabled={enviando || !conteudo.trim()}>
              {enviando ? 'Importando…' : 'Importar'}
            </Botao>
          </div>
        </div>
      </Modal>

      <Modal
        aberto={Boolean(devolvendo)}
        aoFechar={() => setDevolvendo(null)}
        titulo={devolvendo ? `Devolução de ${devolvendo.peca.nome}` : ''}
        descricao={
          devolvendo
            ? `Venda de ${devolvendo.competencia}${devolvendo.canal ? ` · ${devolvendo.canal.nome}` : ''} — ${restaDevolver} ainda com o cliente.`
            : undefined
        }
        largura="max-w-md"
        fecharClicandoFora={false}
      >
        <div className="flex flex-col gap-4">
          <Campo
            rotulo="Quantas voltaram"
            erro={devolucaoInvalida ? `Escreva um número inteiro de 1 a ${restaDevolver}.` : undefined}
            dica="As peças voltam ao estoque de prontas e a venda passa a valer o líquido."
          >
            <InputNumero
              min={1}
              max={restaDevolver}
              valor={quantosVoltam === '' ? null : Number(quantosVoltam)}
              aoMudar={(n) => setQuantosVoltam(n === null ? '' : String(n))}
            />
          </Campo>
          <p className="rounded-lg bg-superficie-2 p-3 text-xs leading-relaxed text-tinta-fraca">
            A venda NÃO some: ela continua registrando que a peça saiu, que é de onde vem a taxa de
            devolução do canal. O que muda é o número que alimenta o planejamento — peça devolvida
            não é demanda, e contá-la faria o ateliê produzir para um pedido que voltou.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Botao variante="secundario" onClick={() => setDevolvendo(null)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao onClick={confirmarDevolucao} disabled={salvando || devolucaoInvalida}>
              {salvando ? 'Registrando…' : 'Voltou ao estoque'}
            </Botao>
          </div>
        </div>
      </Modal>

      <Modal
        aberto={Boolean(apagando)}
        aoFechar={() => setApagando(null)}
        titulo={apagando ? `Apagar a venda de ${apagando.peca.nome}` : ''}
        largura="max-w-md"
      >
        {apagando && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-tinta">
              {apagando.quantidade} vendidas em {apagando.competencia}
              {apagando.devolvidas > 0 && `, ${apagando.devolvidas} já devolvidas`}.{' '}
              {apagando.quantidade - apagando.devolvidas > 0 ? (
                <>
                  As <strong>{apagando.quantidade - apagando.devolvidas}</strong> que ainda estavam
                  fora voltam para o estoque de prontas.
                </>
              ) : (
                'Nada volta ao estoque — tudo já tinha sido devolvido.'
              )}
            </p>
            <p className="text-xs leading-relaxed text-tinta-fraca">
              Apagar é para venda lançada por engano. Se o cliente devolveu, use “Devolvida”: a venda
              some daqui, e com ela o registro de que a peça chegou a sair.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Botao variante="secundario" onClick={() => setApagando(null)} disabled={salvando}>
                Cancelar
              </Botao>
              <Botao variante="perigo" onClick={confirmarApagar} disabled={salvando}>
                {salvando ? 'Apagando…' : 'Apagar venda'}
              </Botao>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
