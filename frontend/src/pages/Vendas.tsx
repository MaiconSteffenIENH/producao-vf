import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Upload, TrendingDown } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { avisar } from '../components/Toaster'
import {
  Botao,
  CabecalhoPagina,
  Campo,
  Card,
  Carregando,
  Etiqueta,
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

export function Vendas() {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [importarAberto, setImportarAberto] = useState(false)
  const [conteudo, setConteudo] = useState('')
  const [canalId, setCanalId] = useState('')
  const [canais, setCanais] = useState<{ id: string; nome: string }[]>([])
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{
    importadas: number
    atualizadas: number
    naoReconhecidas: { peca: string; quantidade: number; competencia: string }[]
    erros: { linha: number; motivo: string }[]
  } | null>(null)

  const recarregar = useCallback(async () => {
    try {
      const [c, ca] = await Promise.all([api.get('/vendas/comparativo'), api.get('/canais')])
      setLinhas(c.data.linhas)
      setCanais(ca.data)
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
      avisar.ok(`${data.importadas} novas e ${data.atualizadas} atualizadas.`)
      await recarregar()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para importar a planilha.'))
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) return <Carregando texto="Cruzando venda com produção…" />

  const emRisco = linhas.filter((l) => l.cobertura.vaiFaltar)

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
              </p>
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
    </>
  )
}
