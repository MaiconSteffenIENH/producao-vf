import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { brl } from '../lib/format'
import { avisar } from '../components/Toaster'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Botao, CabecalhoPagina, Campo, Card, Carregando, Input, Modal, Textarea, Vazio } from '../components/ui'

type Faixa = {
  id?: string
  valorMinimo: number | string
  valorMaximo: number | string | null
  comissaoPercentual: number | string
  taxaFixa: number | string
  freteSubsidiado: number | string
}

type Canal = {
  id: string
  nome: string
  comissaoPercentual: string
  taxaFixa: string
  freteSubsidiado: string
  percentualAds: string
  percentualImposto: string
  percentualAntecipacao: string
  margemAlvoPercentual: string
  moeda: string
  observacao: string | null
  ativo: boolean
  ordem: number
  faixas: Faixa[]
}

const FORM_VAZIO = {
  nome: '',
  comissaoPercentual: 0,
  taxaFixa: 0,
  freteSubsidiado: 0,
  percentualAds: 0,
  percentualImposto: 0,
  percentualAntecipacao: 0,
  margemAlvoPercentual: 100,
  moeda: 'BRL',
  observacao: '',
  ativo: true,
  ordem: 0,
}

export function Canais() {
  const [canais, setCanais] = useState<Canal[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<Canal | null>(null)
  const [form, setForm] = useState({ ...FORM_VAZIO })
  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [salvando, setSalvando] = useState(false)
  const [paraExcluir, setParaExcluir] = useState<Canal | null>(null)

  const recarregar = useCallback(async () => {
    try {
      const { data } = await api.get('/canais')
      setCanais(data)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para carregar os canais.'))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  const abrirNovo = () => {
    setEditando(null)
    setForm({ ...FORM_VAZIO })
    setFaixas([])
    setAberto(true)
  }

  const abrirEdicao = (c: Canal) => {
    setEditando(c)
    setForm({
      nome: c.nome,
      comissaoPercentual: Number(c.comissaoPercentual),
      taxaFixa: Number(c.taxaFixa),
      freteSubsidiado: Number(c.freteSubsidiado),
      percentualAds: Number(c.percentualAds),
      percentualImposto: Number(c.percentualImposto),
      percentualAntecipacao: Number(c.percentualAntecipacao),
      margemAlvoPercentual: Number(c.margemAlvoPercentual),
      moeda: c.moeda,
      observacao: c.observacao ?? '',
      ativo: c.ativo,
      ordem: c.ordem,
    })
    setFaixas(
      c.faixas.map((f) => ({
        valorMinimo: Number(f.valorMinimo),
        valorMaximo: f.valorMaximo === null ? '' : Number(f.valorMaximo),
        comissaoPercentual: Number(f.comissaoPercentual),
        taxaFixa: Number(f.taxaFixa),
        freteSubsidiado: Number(f.freteSubsidiado),
      })),
    )
    setAberto(true)
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      const corpo = {
        ...form,
        faixas: faixas.map((f) => ({
          valorMinimo: Number(f.valorMinimo) || 0,
          valorMaximo: f.valorMaximo === '' || f.valorMaximo === null ? null : Number(f.valorMaximo),
          comissaoPercentual: Number(f.comissaoPercentual) || 0,
          taxaFixa: Number(f.taxaFixa) || 0,
          freteSubsidiado: Number(f.freteSubsidiado) || 0,
        })),
      }
      if (editando) await api.put(`/canais/${editando.id}`, corpo)
      else await api.post('/canais', corpo)
      avisar.ok('Canal salvo.')
      setAberto(false)
      await recarregar()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para salvar o canal.'))
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async () => {
    if (!paraExcluir) return
    try {
      await api.delete(`/canais/${paraExcluir.id}`)
      avisar.ok('Canal excluído.')
      setParaExcluir(null)
      await recarregar()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para excluir.'))
    }
  }

  const alterarFaixa = (i: number, campo: keyof Faixa, valor: string) =>
    setFaixas((f) => f.map((linha, idx) => (idx === i ? { ...linha, [campo]: valor } : linha)))

  if (carregando) return <Carregando />

  return (
    <>
      <CabecalhoPagina
        titulo="Canais de venda"
        descricao="As taxas que corroem a margem. Marketplace muda comissão sem avisar — confira antes de republicar preço."
        acoes={
          <Botao onClick={abrirNovo}>
            <Plus size={16} /> Novo canal
          </Botao>
        }
      />

      {canais.length === 0 ? (
        <Vazio titulo="Nenhum canal cadastrado" acao={<Botao onClick={abrirNovo}>Cadastrar canal</Botao>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {canais.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-tinta">{c.nome}</h2>
                  <p className="text-xs text-tinta-fraca">
                    margem alvo {Number(c.margemAlvoPercentual)}% · imposto {Number(c.percentualImposto)}%
                    {Number(c.percentualAds) > 0 && ` · ads ${Number(c.percentualAds)}%`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => abrirEdicao(c)}
                    aria-label={`Editar ${c.nome}`}
                    className="rounded-lg p-2 text-tinta-fraca hover:bg-superficie-2 hover:text-tinta"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setParaExcluir(c)}
                    aria-label={`Excluir ${c.nome}`}
                    className="rounded-lg p-2 text-tinta-fraca hover:bg-superficie-2 hover:text-perigo"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {c.faixas.length === 0 ? (
                <p className="mt-3 text-sm text-tinta">
                  Comissão única de {Number(c.comissaoPercentual)}%
                  {Number(c.taxaFixa) > 0 && ` + ${brl(Number(c.taxaFixa))} por pedido`}
                  {Number(c.freteSubsidiado) > 0 && ` + ${brl(Number(c.freteSubsidiado))} de frete`}
                </p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-tinta-fraca">
                    <tr>
                      <th className="py-1 pr-2 font-medium">Faixa</th>
                      <th className="py-1 pr-2 font-medium">Comissão</th>
                      <th className="py-1 pr-2 font-medium">Taxa fixa</th>
                      <th className="py-1 font-medium">Frete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.faixas.map((f, i) => (
                      <tr key={i} className="border-t border-borda">
                        <td className="py-1 pr-2 text-tinta">
                          {f.valorMaximo === null
                            ? `acima de ${brl(Number(f.valorMinimo))}`
                            : `${brl(Number(f.valorMinimo))} – ${brl(Number(f.valorMaximo))}`}
                        </td>
                        <td className="py-1 pr-2 text-tinta">{Number(f.comissaoPercentual)}%</td>
                        <td className="py-1 pr-2 text-tinta">{brl(Number(f.taxaFixa))}</td>
                        <td className="py-1 text-tinta">{brl(Number(f.freteSubsidiado))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {c.observacao && <p className="mt-3 text-xs text-tinta-fraca">{c.observacao}</p>}
            </Card>
          ))}
        </div>
      )}

      <Modal aberto={aberto} aoFechar={() => setAberto(false)} titulo={editando ? `Editar ${editando.nome}` : 'Novo canal'} largura="max-w-3xl">
        <form onSubmit={salvar} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome">
              <Input required maxLength={60} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </Campo>
            <Campo rotulo="Margem de lucro alvo (%)" dica="Sobre o custo real, já com a perda embutida.">
              <Input
                type="number"
                min={0}
                step="1"
                value={form.margemAlvoPercentual}
                onChange={(e) => setForm({ ...form, margemAlvoPercentual: Number(e.target.value) })}
              />
            </Campo>
            {[
              ['comissaoPercentual', 'Comissão padrão (%)'],
              ['percentualImposto', 'Imposto sobre a venda (%)'],
              ['percentualAds', 'Anúncios (%)'],
              ['percentualAntecipacao', 'Antecipação (%)'],
            ].map(([campo, rotulo]) => (
              <Campo key={campo} rotulo={rotulo}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={String(form[campo as keyof typeof form])}
                  onChange={(e) => setForm({ ...form, [campo]: Number(e.target.value) })}
                />
              </Campo>
            ))}
            <Campo rotulo="Taxa fixa padrão (R$)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.taxaFixa}
                onChange={(e) => setForm({ ...form, taxaFixa: Number(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Frete que você banca (R$)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.freteSubsidiado}
                onChange={(e) => setForm({ ...form, freteSubsidiado: Number(e.target.value) })}
              />
            </Campo>
          </div>

          <div className="rounded-xl border border-borda p-3">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-tinta">Faixas de preço</h3>
                <p className="text-xs text-tinta-fraca">
                  Quando preenchidas, substituem a comissão padrão. É assim que Shopee e Mercado Livre cobram.
                </p>
              </div>
              <Botao
                type="button"
                variante="secundario"
                onClick={() =>
                  setFaixas((f) => [
                    ...f,
                    { valorMinimo: 0, valorMaximo: '', comissaoPercentual: 0, taxaFixa: 0, freteSubsidiado: 0 },
                  ])
                }
              >
                <Plus size={14} /> Faixa
              </Botao>
            </div>

            {faixas.length === 0 && <p className="py-2 text-sm text-tinta-fraca">Sem faixas: usa a comissão padrão.</p>}

            <div className="flex flex-col gap-2">
              {faixas.map((f, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg bg-superficie-2 p-2 sm:grid-cols-6">
                  {[
                    ['valorMinimo', 'De R$'],
                    ['valorMaximo', 'Até R$'],
                    ['comissaoPercentual', 'Comissão %'],
                    ['taxaFixa', 'Taxa fixa'],
                    ['freteSubsidiado', 'Frete'],
                  ].map(([campo, rotulo]) => (
                    <label key={campo} className="block">
                      <span className="mb-0.5 block text-[11px] text-tinta-fraca">{rotulo}</span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder={campo === 'valorMaximo' ? 'sem teto' : ''}
                        value={String(f[campo as keyof Faixa] ?? '')}
                        onChange={(e) => alterarFaixa(i, campo as keyof Faixa, e.target.value)}
                      />
                    </label>
                  ))}
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => setFaixas((lista) => lista.filter((_, idx) => idx !== i))}
                      aria-label="Remover faixa"
                      className="rounded-lg p-2 text-tinta-fraca hover:bg-superficie hover:text-perigo"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Campo rotulo="Observação" dica="Anote a data em que você conferiu as taxas — elas mudam.">
            <Textarea
              rows={2}
              maxLength={300}
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </Campo>

          <label className="flex items-center gap-2 text-sm text-tinta">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              className="h-4 w-4 accent-[var(--color-marca)]"
            />
            Canal ativo
          </label>

          <div className="flex flex-wrap justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar canal'}
            </Botao>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        aberto={Boolean(paraExcluir)}
        titulo="Excluir canal"
        mensagem={`Excluir ${paraExcluir?.nome}? Os preços praticados registrados nele vão junto.`}
        textoConfirmar="Excluir"
        perigo
        aoConfirmar={excluir}
        aoCancelar={() => setParaExcluir(null)}
      />
    </>
  )
}
