import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Calculator } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { brl } from '../lib/format'
import { avisar } from '../components/Toaster'
import { Botao, CabecalhoPagina, Campo, Card, Carregando, Etiqueta, Input, Modal, Vazio } from '../components/ui'

type Custo = {
  materialDireto: number
  maoDeObra: number
  custoUnitarioSemPerda: number
  perdaPercentual: number
  perdaOrigem: 'medida' | 'estimada'
  perdaAmostra: number
  custoUnitarioReal: number
}

type PrecoCanal = {
  canalId: string
  canal: string
  precoSugerido: number
  comissaoPercentual: number
  taxaFixa: number
  freteSubsidiado: number
  totalDescontos: number
  recebeLiquido: number
  lucro: number
  margemSobrePreco: number
  faixaAplicada: string
  precoAtual: number | null
  margemAtual: number | null
  alerta: string | null
}

type LinhaPeca = {
  pecaId: string
  peca: string
  categoria: string
  precoBase: number | null
  custo: Custo | null
  canais: PrecoCanal[]
  aviso: string | null
}

const FORM_VAZIO = {
  custoArgila: 0,
  custoEsmalte: 0,
  custoQueima: 0,
  custoEmbalagem: 0,
  minutosMaoDeObra: 0,
  custoHoraMaoDeObra: 0,
  outrosCustos: 0,
  perdaEstimadaPercentual: 10,
}

export function Precos() {
  const [linhas, setLinhas] = useState<LinhaPeca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState<LinhaPeca | null>(null)
  const [form, setForm] = useState({ ...FORM_VAZIO })
  const [precosAtuais, setPrecosAtuais] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  const recarregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const { data } = await api.get('/precos')
      setLinhas(data.pecas)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para calcular os preços.'))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  const abrir = (linha: LinhaPeca) => {
    setEditando(linha)
    setForm({ ...FORM_VAZIO })
    setPrecosAtuais(
      Object.fromEntries(linha.canais.map((c) => [c.canalId, c.precoAtual === null ? '' : String(c.precoAtual)])),
    )
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editando) return
    setSalvando(true)
    try {
      await api.put(`/precos/peca/${editando.pecaId}`, {
        ...form,
        precos: Object.entries(precosAtuais).map(([canalId, valor]) => ({
          canalId,
          precoAtual: valor === '' ? null : Number(valor),
        })),
      })
      avisar.ok('Custo salvo.')
      setEditando(null)
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para salvar o custo.'))
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) return <Carregando texto="Calculando com a perda real…" />

  const comCusto = linhas.filter((l) => l.custo)
  const semCusto = linhas.filter((l) => !l.custo)

  return (
    <>
      <CabecalhoPagina
        titulo="Preços"
        descricao="Quanto cobrar em cada canal para a peça dar lucro depois de comissão, taxa fixa e imposto."
      />

      {semCusto.length > 0 && (
        <Card className="mb-4">
          <p className="flex items-center gap-2 text-sm font-medium text-alerta">
            <AlertTriangle size={16} /> {semCusto.length} peça(s) sem custo cadastrado
          </p>
          <p className="mt-1 text-sm text-tinta-fraca">
            Sem o custo não há preço a calcular. Comece pelas que mais vendem.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {semCusto.map((l) => (
              <button
                key={l.pecaId}
                onClick={() => abrir(l)}
                className="rounded-full border border-borda px-2.5 py-1 text-xs text-tinta hover:bg-superficie-2"
              >
                {l.peca}
              </button>
            ))}
          </div>
        </Card>
      )}

      {comCusto.length === 0 ? (
        <Vazio
          titulo="Nenhum custo cadastrado ainda"
          descricao="Cadastre argila, esmalte, queima, embalagem e mão de obra de uma peça para ver os preços por canal."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {comCusto.map((linha) => (
            <Card key={linha.pecaId}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-titulo text-xl text-tinta">{linha.peca}</h2>
                  <p className="text-xs text-tinta-fraca">{linha.categoria}</p>
                </div>
                <Botao variante="secundario" onClick={() => abrir(linha)}>
                  <Calculator size={16} /> Editar custo
                </Botao>
              </div>

              {linha.custo && (
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-superficie-2 px-3 py-2 text-sm">
                  <span className="text-tinta-fraca">
                    Material <strong className="text-tinta">{brl(linha.custo.materialDireto)}</strong>
                  </span>
                  <span className="text-tinta-fraca">
                    Mão de obra <strong className="text-tinta">{brl(linha.custo.maoDeObra)}</strong>
                  </span>
                  <span className="text-tinta-fraca">
                    Perda{' '}
                    <strong className="text-tinta">{linha.custo.perdaPercentual.toFixed(1)}%</strong>{' '}
                    <Etiqueta cor={linha.custo.perdaOrigem === 'medida' ? '#3E5C4B' : '#918787'}>
                      {linha.custo.perdaOrigem === 'medida'
                        ? `medida em ${linha.custo.perdaAmostra} peças`
                        : 'estimada'}
                    </Etiqueta>
                  </span>
                  <span className="text-tinta">
                    Custo real por peça <strong>{brl(linha.custo.custoUnitarioReal)}</strong>
                  </span>
                </div>
              )}

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-tinta-fraca">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Canal</th>
                      <th className="py-2 pr-3 font-medium">Sugerido</th>
                      <th className="py-2 pr-3 font-medium">Taxas</th>
                      <th className="py-2 pr-3 font-medium">Recebe</th>
                      <th className="py-2 pr-3 font-medium">Lucro</th>
                      <th className="py-2 font-medium">Praticado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linha.canais.map((c) => (
                      <tr key={c.canalId} className="border-t border-borda align-top">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-tinta">{c.canal}</p>
                          <p className="text-xs text-tinta-fraca">{c.faixaAplicada}</p>
                        </td>
                        <td className="py-2 pr-3 font-semibold text-tinta">{brl(c.precoSugerido)}</td>
                        <td className="py-2 pr-3 text-tinta-fraca">
                          {c.comissaoPercentual}%
                          {c.taxaFixa > 0 && ` + ${brl(c.taxaFixa)}`}
                          {c.freteSubsidiado > 0 && ` + frete ${brl(c.freteSubsidiado)}`}
                          <br />
                          <span className="text-xs">total {brl(c.totalDescontos)}</span>
                        </td>
                        <td className="py-2 pr-3 text-tinta">{brl(c.recebeLiquido)}</td>
                        <td className="py-2 pr-3">
                          <span className={c.lucro > 0 ? 'text-verde' : 'text-perigo'}>{brl(c.lucro)}</span>
                          <br />
                          <span className="text-xs text-tinta-fraca">{c.margemSobrePreco.toFixed(0)}% do preço</span>
                        </td>
                        <td className="py-2">
                          {c.precoAtual === null ? (
                            <span className="text-tinta-fraca">—</span>
                          ) : (
                            <>
                              <span className="text-tinta">{brl(c.precoAtual)}</span>
                              {c.margemAtual !== null && (
                                <span className={`block text-xs ${c.margemAtual < 0 ? 'text-perigo' : 'text-tinta-fraca'}`}>
                                  margem {c.margemAtual.toFixed(0)}%
                                </span>
                              )}
                            </>
                          )}
                          {c.alerta && <span className="mt-1 block text-xs text-perigo">{c.alerta}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {linha.precoBase !== null && (
                <p className="mt-2 text-xs text-tinta-fraca">Preço no site hoje: {brl(linha.precoBase)}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        aberto={Boolean(editando)}
        aoFechar={() => setEditando(null)}
        titulo={`Custo de ${editando?.peca ?? ''}`}
        largura="max-w-2xl"
      >
        <form onSubmit={salvar} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['custoArgila', 'Argila por peça (R$)'],
              ['custoEsmalte', 'Esmalte por peça (R$)'],
              ['custoQueima', 'Queima por peça (R$)'],
              ['custoEmbalagem', 'Embalagem por peça (R$)'],
              ['outrosCustos', 'Outros custos (R$)'],
            ].map(([campo, rotulo]) => (
              <Campo key={campo} rotulo={rotulo}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(form[campo as keyof typeof form])}
                  onChange={(e) => setForm({ ...form, [campo]: Number(e.target.value) })}
                />
              </Campo>
            ))}
            <Campo rotulo="Minutos de mão de obra">
              <Input
                type="number"
                min={0}
                value={form.minutosMaoDeObra}
                onChange={(e) => setForm({ ...form, minutosMaoDeObra: Number(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Custo da hora (R$)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.custoHoraMaoDeObra}
                onChange={(e) => setForm({ ...form, custoHoraMaoDeObra: Number(e.target.value) })}
              />
            </Campo>
            <Campo
              rotulo="Perda estimada (%)"
              dica="Usada só enquanto não houver histórico suficiente. Depois o sistema usa a perda medida."
            >
              <Input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={form.perdaEstimadaPercentual}
                onChange={(e) => setForm({ ...form, perdaEstimadaPercentual: Number(e.target.value) })}
              />
            </Campo>
          </div>

          {editando && editando.canais.length > 0 && (
            <div className="rounded-xl border border-borda p-3">
              <h3 className="text-sm font-semibold text-tinta">Preço praticado hoje</h3>
              <p className="mb-2 text-xs text-tinta-fraca">
                Opcional. Serve para o sistema avisar quando um preço está abaixo do que fecha a conta.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {editando.canais.map((c) => (
                  <Campo key={c.canalId} rotulo={c.canal}>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={precosAtuais[c.canalId] ?? ''}
                      onChange={(e) => setPrecosAtuais({ ...precosAtuais, [c.canalId]: e.target.value })}
                    />
                  </Campo>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setEditando(null)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar custo'}
            </Botao>
          </div>
        </form>
      </Modal>
    </>
  )
}
