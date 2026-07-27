import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ClipboardCheck, Plus, Trash2 } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { avisar } from '../components/Toaster'
import {
  Botao,
  CabecalhoPagina,
  Campo,
  Card,
  Carregando,
  Etiqueta,
  Input,
  Modal,
  Select,
  Textarea,
  Vazio,
} from '../components/ui'
import { dataBr } from '../lib/format'

/*
 * ENCOMENDA COM PRAZO.
 *
 * Não estava no briefing. Um jogo sob medida tem data e cliente, e disputa o
 * MESMO forno com a produção de estoque. Sem estar no sistema, encomenda vira
 * post-it na parede que fura a fila sem ninguém saber por quê.
 *
 * O aviso de prazo compara com o TETO da previsão, não com o piso: prometer
 * pelo melhor caso é como se perde cliente de encomenda.
 */

type Item = { id?: string; pecaId: string; corId?: string | null; quantidade: number; peca?: { nome: string }; cor?: { nome: string; hex: string } | null }
type Encomenda = {
  id: string
  codigo: string
  cliente: string
  contato: string | null
  status: string
  entregarAte: string | null
  observacao: string | null
  itens: Item[]
  prazo: { diasAteEntrega: number; previsao: string; cabe: boolean; aviso: string | null } | null
}

const COR_STATUS: Record<string, string> = {
  aberta: '#a66836',
  em_producao: '#8e7150',
  pronta: '#3e5c4b',
  entregue: '#3e5c4b',
  cancelada: '#8a807c',
}
const ROTULO_STATUS: Record<string, string> = {
  aberta: 'aberta',
  em_producao: 'em produção',
  pronta: 'pronta',
  entregue: 'entregue',
  cancelada: 'cancelada',
}

const vazia = {
  cliente: '',
  contato: '',
  entregarAte: '',
  observacao: '',
  itens: [{ pecaId: '', corId: '', quantidade: 1 }],
}

export function Encomendas() {
  const [lista, setLista] = useState<Encomenda[]>([])
  const [pecas, setPecas] = useState<{ id: string; nome: string }[]>([])
  const [cores, setCores] = useState<{ id: string; nome: string }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState(vazia)
  const [enviando, setEnviando] = useState(false)

  const recarregar = useCallback(async () => {
    try {
      const [e, p, c] = await Promise.all([
        api.get('/encomendas'),
        api.get('/pecas?ativo=true'),
        api.get('/cores'),
      ])
      setLista(e.data)
      setPecas(p.data)
      setCores(c.data)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para carregar as encomendas.'))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    try {
      await api.post('/encomendas', {
        cliente: form.cliente,
        contato: form.contato || null,
        entregarAte: form.entregarAte || null,
        observacao: form.observacao || null,
        itens: form.itens
          .filter((i) => i.pecaId)
          .map((i) => ({ pecaId: i.pecaId, corId: i.corId || null, quantidade: Number(i.quantidade) })),
      })
      avisar.ok('Encomenda registrada.')
      setAberto(false)
      setForm(vazia)
      await recarregar()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para registrar a encomenda.'))
    } finally {
      setEnviando(false)
    }
  }

  const mudarStatus = async (id: string, status: string) => {
    try {
      await api.put(`/encomendas/${id}`, { status })
      await recarregar()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para mudar o status.'))
    }
  }

  if (carregando) return <Carregando />

  const emRisco = lista.filter((e) => e.prazo && !e.prazo.cabe && e.status !== 'entregue')

  return (
    <>
      <CabecalhoPagina
        titulo="Encomendas"
        descricao="Pedido com cliente e data. No planejamento, encomenda passa na frente da produção de estoque."
        acoes={
          <Botao onClick={() => setAberto(true)} className="col-span-2 justify-center sm:col-span-1">
            <Plus size={16} /> Nova encomenda
          </Botao>
        }
      />

      {emRisco.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-perigo/30 bg-perigo/5 px-4 py-3 text-sm leading-relaxed text-tinta">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-perigo" />
          <span>
            <strong className="text-perigo">
              {emRisco.length} {emRisco.length === 1 ? 'encomenda' : 'encomendas'} sem folga de prazo
            </strong>{' '}
            — pela previsão do roteiro, não dá para entregar na data combinada.
          </span>
        </p>
      )}

      {lista.length === 0 ? (
        <Vazio
          icone={<ClipboardCheck size={22} />}
          titulo="Nenhuma encomenda"
          descricao="Registre aqui pedido sob medida com data. O planejamento passa a considerá-lo antes da produção de estoque, e o sistema avisa se o prazo não fecha."
          acao={<Botao onClick={() => setAberto(true)}>Registrar a primeira</Botao>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map((e) => (
            <Card key={e.id} className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium text-tinta">
                    {e.codigo} · {e.cliente}
                  </h2>
                  <Etiqueta cor={COR_STATUS[e.status] ?? '#8a807c'}>
                    {ROTULO_STATUS[e.status] ?? e.status}
                  </Etiqueta>
                  {e.prazo && !e.prazo.cabe && <Etiqueta cor="#a4402f">prazo apertado</Etiqueta>}
                </div>
                <p className="mt-0.5 text-sm text-tinta-fraca">
                  {e.itens
                    .map((i) => `${i.quantidade}× ${i.peca?.nome ?? '?'}${i.cor ? ` ${i.cor.nome}` : ''}`)
                    .join(', ')}
                </p>
                {e.entregarAte && (
                  <p className="text-xs text-tinta-fraca">
                    Entregar até {dataBr(e.entregarAte)}
                    {e.prazo && ` · produzir leva ${e.prazo.previsao} · faltam ${e.prazo.diasAteEntrega} dias`}
                  </p>
                )}
                {e.prazo?.aviso && <p className="mt-1 text-xs text-perigo">{e.prazo.aviso}</p>}
                {e.observacao && <p className="mt-1 text-xs text-tinta-fraca">{e.observacao}</p>}
              </div>

              <div className="w-full shrink-0 lg:w-44">
                <Select value={e.status} onChange={(ev) => mudarStatus(e.id, ev.target.value)}>
                  {Object.entries(ROTULO_STATUS).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </Select>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Nova encomenda"
        descricao="O prazo é conferido contra o roteiro da peça mais demorada do pedido."
        largura="max-w-2xl"
      >
        <form onSubmit={salvar} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Cliente">
              <Input
                required
                value={form.cliente}
                onChange={(e) => setForm({ ...form, cliente: e.target.value })}
                placeholder="Restaurante Ateliê"
              />
            </Campo>
            <Campo rotulo="Contato" dica="Telefone, e-mail, o que for mais fácil.">
              <Input
                value={form.contato}
                onChange={(e) => setForm({ ...form, contato: e.target.value })}
              />
            </Campo>
          </div>

          <Campo rotulo="Entregar até" dica="O sistema avisa se o roteiro não cabe nesta data.">
            <Input
              type="date"
              value={form.entregarAte}
              onChange={(e) => setForm({ ...form, entregarAte: e.target.value })}
            />
          </Campo>

          <div>
            <p className="mb-2 text-sm font-medium text-tinta">Itens</p>
            <div className="flex flex-col gap-2">
              {form.itens.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[2fr_1.5fr_5rem_auto]">
                  <Select
                    required
                    value={item.pecaId}
                    onChange={(e) => {
                      const itens = [...form.itens]
                      itens[i] = { ...item, pecaId: e.target.value }
                      setForm({ ...form, itens })
                    }}
                  >
                    <option value="">— peça —</option>
                    {pecas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={item.corId ?? ''}
                    onChange={(e) => {
                      const itens = [...form.itens]
                      itens[i] = { ...item, corId: e.target.value }
                      setForm({ ...form, itens })
                    }}
                  >
                    <option value="">cor a definir</option>
                    {cores.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantidade}
                    onChange={(e) => {
                      const itens = [...form.itens]
                      itens[i] = { ...item, quantidade: Number(e.target.value) }
                      setForm({ ...form, itens })
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm({ ...form, itens: form.itens.filter((_, j) => j !== i) })
                    }
                    disabled={form.itens.length === 1}
                    aria-label="Remover item"
                    className="rounded-lg p-2 text-tinta-fraca transition hover:bg-superficie-2 hover:text-perigo disabled:opacity-40"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <Botao
              type="button"
              variante="secundario"
              className="mt-2"
              onClick={() =>
                setForm({ ...form, itens: [...form.itens, { pecaId: '', corId: '', quantidade: 1 }] })
              }
            >
              <Plus size={15} /> Adicionar item
            </Botao>
          </div>

          <Campo rotulo="Observação">
            <Textarea
              rows={2}
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </Campo>

          <div className="flex justify-end gap-2">
            <Botao type="button" variante="secundario" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
            <Botao type="submit" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Registrar'}
            </Botao>
          </div>
        </form>
      </Modal>
    </>
  )
}
