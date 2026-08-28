import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { avisar } from '../components/Toaster'
import { Botao, Carregando, Vazio } from '../components/ui'

/*
 * A ORDEM DE PRODUÇÃO — a folha que vai para a bancada.
 *
 * Substitui a ficha plastificada pendurada no ateliê, que semana passada se
 * perdeu e levou junto as medidas: teve que medir tudo de novo no dia seguinte.
 * Aqui o papel é descartável e o dado fica no sistema, então perder a folha
 * custa uma reimpressão.
 *
 * ── POR QUE ESTA TELA NÃO USA O LAYOUT DO SISTEMA ──
 *
 * Ela é rota irmã do Layout, sem menu lateral e sem cabeçalho. Não é capricho:
 * o que aparece na tela é o que sai na impressora, e esconder a moldura só no
 * `@media print` deixaria a pessoa conferindo uma coisa e imprimindo outra.
 *
 * ── UMA PEÇA POR FOLHA, OU VÁRIAS ──
 *
 * Com um lote só, a folha usa números grandes: ela fica pendurada e é lida de
 * longe, de pé, com a mão suja de barro. Com mais de um lote — a xícara e o
 * pires do mesmo conjunto — as peças entram em linhas compactas na mesma folha,
 * porque separá-las em duas folhas é como o conjunto se perde.
 */

type Medidas = {
  alturaCm: number | null
  larguraCm: number | null
  diametroBocaCm: number | null
  diametroBaseCm: number | null
  capacidadeMl: number | null
  momento: 'cru' | 'pronto' | null
  toleranciaPct: number | null
}

type Item = {
  loteId: string
  codigo: string
  quantidade: number
  observacao: string | null
  peca: string
  cor: string | null
  corHex: string | null
  argila: string | null
  pesoCruG: number | null
  argilaTotalG: number | null
  medidas: Medidas
}

type Ordem = { geradoEm: string; itens: Item[]; totalArgilaG: number | null }

const umaCasa = (n: number) => Math.round(n * 10) / 10
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))

/** "7,6 a 8,4" — a faixa aceitável, que é o número que a bancada usa. */
function faixa(alvo: number, toleranciaPct: number | null): string {
  if (!toleranciaPct) return `${fmt(umaCasa(alvo))} cm`
  const margem = (alvo * Math.max(0, Math.min(100, toleranciaPct))) / 100
  return `${fmt(umaCasa(alvo - margem))} a ${fmt(umaCasa(alvo + margem))} cm`
}

/** Quilos quando passa de mil gramas: 13,6 kg se lê, 13600 g não. */
function peso(gramas: number | null): string {
  if (gramas === null) return '—'
  return gramas >= 1000 ? `${fmt(umaCasa(gramas / 1000))} kg` : `${gramas} g`
}

const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

const MEDIDAS_NA_ORDEM: { chave: keyof Medidas; rotulo: string }[] = [
  { chave: 'alturaCm', rotulo: 'Altura' },
  { chave: 'larguraCm', rotulo: 'Diâmetro' },
  { chave: 'diametroBocaCm', rotulo: 'Boca' },
  { chave: 'diametroBaseCm', rotulo: 'Base' },
]

function Cabecalho({ ordem }: { ordem: Ordem }) {
  const codigos = ordem.itens.map((i) => i.codigo).join(' · ')
  return (
    <div className="flex items-start justify-between border-b-2 border-marca pb-2.5">
      <div>
        <h1 className="font-titulo text-xl leading-tight text-marca">Ordem de produção</h1>
        <p className="text-xs text-tinta-fraca">Vera Flesch Cerâmica</p>
      </div>
      <div className="text-right text-xs leading-relaxed text-tinta-fraca">
        <p className="text-sm font-semibold text-tinta">{codigos}</p>
        <p>{dataBr(ordem.geradoEm)}</p>
      </div>
    </div>
  )
}

/** Uma peça só: números grandes, para ler de longe. */
function FolhaDeUmaPeca({ ordem }: { ordem: Ordem }) {
  const item = ordem.itens[0]
  const m = item.medidas
  return (
    <>
      <Cabecalho ordem={ordem} />

      <div className="mt-4 flex items-end gap-5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-widest text-tinta-fraca">Peça</p>
          <p className="font-titulo text-3xl leading-tight text-tinta">{item.peca}</p>
          {item.cor && <p className="mt-0.5 text-sm text-tinta-fraca">Esmalte: {item.cor}</p>}
        </div>
        <div className="shrink-0 rounded-lg border-2 border-marca px-5 py-1.5 text-center">
          <p className="text-[11px] uppercase tracking-widest text-tinta-fraca">Produzir</p>
          <p className="font-titulo text-4xl leading-none text-marca">{item.quantidade}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-5 rounded-lg bg-superficie-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-widest text-tinta-fraca">Argila</p>
          <p className="text-base font-medium text-tinta">{item.argila ?? 'não definida'}</p>
        </div>
        <div className="shrink-0 border-l border-borda pl-5 text-right">
          <p className="text-[11px] text-tinta-fraca">por peça</p>
          <p className="text-lg font-semibold text-tinta">{peso(item.pesoCruG)}</p>
        </div>
        <div className="shrink-0 border-l border-borda pl-5 text-right">
          <p className="text-[11px] text-tinta-fraca">separar ao todo</p>
          <p className="text-lg font-semibold text-marca">{peso(item.argilaTotalG)}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-widest text-tinta-fraca">Dimensões</p>
        <MarcaDoMomento momento={m.momento} />
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2">
        {MEDIDAS_NA_ORDEM.map(({ chave, rotulo }) => {
          const valor = m[chave] as number | null
          return (
            <div key={chave} className="rounded-lg border border-borda px-2 py-2.5 text-center">
              <p className="text-[11px] text-tinta-fraca">{rotulo}</p>
              <p className="font-titulo text-2xl leading-tight text-tinta">
                {valor === null ? '—' : fmt(umaCasa(valor))}
              </p>
              <p className="text-[11px] text-tinta-fraca">
                {valor === null ? 'sem padrão' : faixa(valor, m.toleranciaPct)}
              </p>
            </div>
          )
        })}
      </div>

      {m.capacidadeMl !== null && (
        <p className="mt-2 text-sm text-tinta-fraca">Capacidade: {m.capacidadeMl} ml</p>
      )}
      {item.observacao && (
        <p className="mt-3 rounded-lg bg-superficie-2 px-3 py-2 text-sm text-tinta">{item.observacao}</p>
      )}

      <Rodape quantidade={item.quantidade} />
    </>
  )
}

/** Conjunto: xícara e pires na mesma folha, em linhas compactas. */
function FolhaDeConjunto({ ordem }: { ordem: Ordem }) {
  return (
    <>
      <Cabecalho ordem={ordem} />

      <div className="mt-3 flex flex-col">
        {ordem.itens.map((item, i) => {
          const m = item.medidas
          return (
            <div
              key={item.loteId}
              className={`flex items-center gap-4 py-3 ${i > 0 ? 'border-t border-borda' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-titulo text-xl leading-tight text-tinta">{item.peca}</p>
                <p className="text-xs text-tinta-fraca">
                  {item.argila ?? 'argila não definida'}
                  {item.pesoCruG !== null && ` · ${peso(item.pesoCruG)} cada`}
                  {item.cor && ` · ${item.cor}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {MEDIDAS_NA_ORDEM.map(({ chave, rotulo }) => {
                  const valor = m[chave] as number | null
                  return (
                    <div key={chave} className="min-w-[3.5rem] rounded-lg border border-borda px-2 py-1.5 text-center">
                      <p className="text-[10px] text-tinta-fraca">{rotulo}</p>
                      <p className="text-base font-semibold text-tinta">
                        {valor === null ? '—' : fmt(umaCasa(valor))}
                      </p>
                    </div>
                  )
                })}
                <div className="min-w-[3.8rem] rounded-lg border-2 border-marca px-2 py-1.5 text-center">
                  <p className="text-[10px] text-tinta-fraca">Fazer</p>
                  <p className="text-lg font-semibold text-marca">{item.quantidade}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {ordem.totalArgilaG !== null && (
        <div className="mt-2 flex justify-between rounded-lg bg-superficie-2 px-3 py-2 text-sm">
          <span className="text-tinta">Argila a separar para o conjunto</span>
          <span className="font-semibold text-marca">{peso(ordem.totalArgilaG)}</span>
        </div>
      )}

      <Rodape quantidade={ordem.itens.reduce((n, i) => n + i.quantidade, 0)} />
    </>
  )
}

/**
 * O aviso do momento da medição.
 *
 * A ficha de papel do ateliê não diz se as medidas são do cru ou do pronto, e
 * a diferença é de 10% a 15% — a argila encolhe na queima. Sem isto, o oleiro
 * confere a peça crua contra um número que só valeria depois do forno.
 */
function MarcaDoMomento({ momento }: { momento: 'cru' | 'pronto' | null }) {
  if (!momento) {
    return <span className="text-xs text-alerta">momento da medição não definido</span>
  }
  return (
    <span className="rounded-full bg-marca px-2.5 py-0.5 text-xs text-contraste">
      {momento === 'cru' ? 'medidas na peça crua' : 'medidas na peça pronta'}
    </span>
  )
}

function Rodape({ quantidade }: { quantidade: number }) {
  return (
    <div className="mt-5 flex items-end justify-between border-t border-dashed border-marca-clara pt-2.5 text-xs text-tinta-fraca">
      <p>
        Saíram <span className="inline-block w-14 border-b border-tinta-fraca" /> de {quantidade}
        {'  ·  '}Perdidas <span className="inline-block w-12 border-b border-tinta-fraca" />
        {'  ·  '}Data <span className="inline-block w-16 border-b border-tinta-fraca" />
      </p>
      <p>gerado pelo sistema</p>
    </div>
  )
}

export function OrdemProducao() {
  const [params] = useSearchParams()
  const ids = (params.get('lotes') ?? '').split(',').filter(Boolean)
  const [ordem, setOrdem] = useState<Ordem | null>(null)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    if (ids.length === 0) {
      setCarregando(false)
      return
    }
    try {
      const { data } = await api.get(`/lotes/ordem-producao?ids=${ids.join(',')}`)
      setOrdem(data)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para montar a ordem de produção.'))
    } finally {
      setCarregando(false)
    }
    // os ids vêm da URL e não mudam sem recarregar a rota
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (carregando) return <Carregando texto="Montando a ordem…" />
  if (!ordem || ordem.itens.length === 0) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <Vazio
          titulo="Nenhum lote nesta ordem"
          descricao="A ordem de produção é gerada a partir de um lote aberto. Volte ao quadro de produção e use o botão de imprimir no cartão do lote."
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-fundo p-4 sm:p-8">
      {/* a barra some na impressão: ela é da tela, não da folha */}
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <Botao onClick={() => window.print()}>
          <Printer size={16} /> Imprimir
        </Botao>
      </div>

      <div className="mx-auto max-w-[210mm] rounded-xl border border-borda bg-superficie p-7 shadow-baixa print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {ordem.itens.length === 1 ? <FolhaDeUmaPeca ordem={ordem} /> : <FolhaDeConjunto ordem={ordem} />}
      </div>
    </div>
  )
}
