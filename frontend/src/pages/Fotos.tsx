import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Camera, PackageCheck } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { avisar } from '../components/Toaster'
import { Botao, CabecalhoPagina, Card, Carregando, ChipCor, Etiqueta, Select, Vazio } from '../components/ui'

/*
 * A FILA DA GABI.
 *
 * Peça pronta sem foto não é peça vendável. O quadro mostrava tudo verde em
 * "Pronto" enquanto a peça não estava anunciada em lugar nenhum — e com a Gabi
 * na Espanha essa passagem virou fila com fuso horário no meio.
 *
 * A ordem da tela não é o ciclo: é o PREJUÍZO. Combinação com peça pronta e sem
 * foto está com dinheiro parado na prateleira.
 */

type LinhaFoto = {
  id: string
  peca: string
  cor: string
  corHex: string
  malhado: boolean
  amostraUrl: string | null
  status: string
  rotulo: string
  prontas: number
  aCaminho: number
  travando: boolean
  nuncaFotografada: boolean
}

type Resumo = Record<string, number>

const CICLO = ['pendente', 'fotografado', 'enviado', 'editado', 'publicado']
const COR_ETAPA: Record<string, string> = {
  pendente: '#a4402f',
  fotografado: '#a66836',
  enviado: '#79612a',
  editado: '#8e7150',
  publicado: '#3e5c4b',
}

export function Fotos() {
  const [linhas, setLinhas] = useState<LinhaFoto[]>([])
  const [resumo, setResumo] = useState<Resumo>({})
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [mexendo, setMexendo] = useState<string | null>(null)

  const recarregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const { data } = await api.get('/fotos')
      setLinhas(data.linhas)
      setResumo(data.resumo)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para carregar a fila de fotos.'))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])
  useAutoRefresh(useCallback(() => void recarregar(true), [recarregar]))

  const avancar = async (id: string) => {
    setMexendo(id)
    try {
      await api.post(`/fotos/${id}/avancar`)
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para avançar.'))
    } finally {
      setMexendo(null)
    }
  }

  const definir = async (id: string, status: string) => {
    setMexendo(id)
    try {
      await api.patch(`/fotos/${id}`, { status })
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para mudar a etapa.'))
    } finally {
      setMexendo(null)
    }
  }

  if (carregando) return <Carregando texto="Vendo o que está esperando foto…" />

  const visiveis = filtro ? linhas.filter((l) => l.status === filtro) : linhas

  return (
    <>
      <CabecalhoPagina
        titulo="Fotos"
        descricao="Peça pronta sem foto não é peça vendável. Aqui está cada combinação de peça e esmalte, e onde ela parou."
        acoes={
          <div className="col-span-2 min-w-0 sm:col-span-1 sm:w-56">
            <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="">Todas as etapas</option>
              {CICLO.map((e) => (
                <option key={e} value={e}>
                  {e} ({resumo[e] ?? 0})
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {(resumo.travando ?? 0) > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-perigo/30 bg-perigo/5 px-4 py-3 text-sm leading-relaxed text-tinta">
          <PackageCheck size={17} className="mt-0.5 shrink-0 text-perigo" />
          <span>
            <strong className="text-perigo">{resumo.pecasTravadas} peças prontas</strong> não podem ir
            para a loja porque a combinação ainda não tem foto publicada. Elas contam como estoque, mas
            não como venda possível.
          </span>
        </p>
      )}

      {/* o ciclo, para saber onde está o gargalo antes de olhar a lista */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {CICLO.map((etapa) => (
          <button
            key={etapa}
            onClick={() => setFiltro(filtro === etapa ? '' : etapa)}
            className={`rounded-2xl border p-3 text-left transition-all duration-200 ${
              filtro === etapa
                ? 'border-marca bg-marca/10 shadow-media'
                : 'border-borda bg-superficie hover:-translate-y-0.5 hover:border-marca-clara'
            }`}
          >
            <p className="font-titulo text-2xl leading-none text-tinta">{resumo[etapa] ?? 0}</p>
            <p className="mt-1 text-xs capitalize text-tinta-fraca">{etapa}</p>
          </button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <Vazio
          icone={<Camera size={22} />}
          titulo="Nada esperando foto"
          descricao="Toda combinação de peça e esmalte com peça pronta já está publicada. É o estado que a loja quer."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {visiveis.map((l) => (
            <Card key={l.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium text-tinta">{l.peca}</h2>
                  <ChipCor nome={l.cor} hex={l.corHex} amostraUrl={l.amostraUrl} malhado={l.malhado} tamanho={14} />
                  <Etiqueta cor={COR_ETAPA[l.status] ?? '#8a807c'}>{l.rotulo}</Etiqueta>
                  {l.travando && <Etiqueta cor="#a4402f">{l.prontas} paradas</Etiqueta>}
                </div>
                <p className="mt-0.5 text-sm text-tinta-fraca">
                  {l.nuncaFotografada
                    ? 'Combinação nova — nunca foi fotografada.'
                    : `Já fotografada; o ciclo parou em "${l.status}".`}{' '}
                  {l.prontas > 0 && `${l.prontas} pronta${l.prontas === 1 ? '' : 's'} no estoque.`}
                  {l.aCaminho > 0 && ` ${l.aCaminho} a caminho.`}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <div className="w-40">
                  <Select
                    value={l.status}
                    onChange={(e) => definir(l.id, e.target.value)}
                    disabled={mexendo === l.id}
                  >
                    {CICLO.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </Select>
                </div>
                {l.status !== 'publicado' && (
                  <Botao variante="secundario" onClick={() => avancar(l.id)} disabled={mexendo === l.id}>
                    <ArrowRight size={15} /> Avançar
                  </Botao>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-tinta-fraca">
        A granularidade é peça + esmalte, e não lote, de propósito: um Bowl Pistache fotografado uma vez
        serve toda fornada futura. O que precisa de foto nova é combinação que nunca existiu — e é
        exatamente isso que a lista destaca.
      </p>
    </>
  )
}
