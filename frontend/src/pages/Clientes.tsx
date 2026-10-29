import { useCallback, useEffect, useState } from 'react'
import { Building2, ClipboardPaste, Pencil, Plus, Trash2 } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { avisar } from '../components/Toaster'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  Botao,
  CabecalhoPagina,
  Campo,
  Card,
  Carregando,
  Etiqueta,
  Input,
  Modal,
  Textarea,
  Vazio,
} from '../components/ui'

/*
 * CLIENTES E FORNECEDORES.
 *
 * Pedido da Gabi em 05/09: cliente e fornecedor eram texto solto na encomenda
 * e na matéria-prima, e "Auto Center", "auto center" e "AutoCenter" eram três
 * empresas. A migração já converteu o que existia; esta tela é onde o
 * cadastro passa a ser cuidado. O cartão CNPJ da Receita, colado, preenche o
 * formulário inteiro: ninguém digita razão social e endereço à mão.
 */
type Tipo = 'clientes' | 'fornecedores'

type Parceiro = {
  id: string
  nome: string
  documento: string | null
  email: string | null
  telefone: string | null
  endereco: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  atividade: string | null
  porte: string | null
  situacaoCadastral: string | null
  dataAbertura: string | null
  observacao: string | null
  ativo: boolean
  _count?: { encomendas?: number; materias?: number }
}

type Formulario = {
  nome: string
  documento: string
  email: string
  telefone: string
  endereco: string
  bairro: string
  cidade: string
  uf: string
  cep: string
  atividade: string
  porte: string
  situacao: string
  dataAbertura: string
  observacao: string
  ativo: boolean
}

const VAZIO: Formulario = {
  nome: '', documento: '', email: '', telefone: '', endereco: '', bairro: '', cidade: '', uf: '', cep: '',
  atividade: '', porte: '', situacao: '', dataAbertura: '', observacao: '', ativo: true,
}

const doRegistro = (p: Parceiro): Formulario => ({
  nome: p.nome,
  documento: p.documento ?? '',
  email: p.email ?? '',
  telefone: p.telefone ?? '',
  endereco: p.endereco ?? '',
  bairro: p.bairro ?? '',
  cidade: p.cidade ?? '',
  uf: p.uf ?? '',
  cep: p.cep ?? '',
  atividade: p.atividade ?? '',
  porte: p.porte ?? '',
  situacao: p.situacaoCadastral ?? '',
  dataAbertura: p.dataAbertura ? p.dataAbertura.slice(0, 10) : '',
  observacao: p.observacao ?? '',
  ativo: p.ativo,
})

/** "25/03/2022" do cartão vira "2022-03-25" do campo de data */
function dataDoCartao(v: string | null): string {
  if (!v) return ''
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v
}

export function Clientes() {
  const [tipo, setTipo] = useState<Tipo>('clientes')
  const [lista, setLista] = useState<Parceiro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Parceiro | 'novo' | null>(null)
  const [form, setForm] = useState<Formulario>(VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [cartaoAberto, setCartaoAberto] = useState(false)
  const [textoCartao, setTextoCartao] = useState('')
  const [apagando, setApagando] = useState<Parceiro | null>(null)

  const singular = tipo === 'clientes' ? 'cliente' : 'fornecedor'

  const recarregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true)
      try {
        const { data } = await api.get<Parceiro[]>(`/${tipo}`, { params: busca ? { busca } : undefined })
        setLista(data)
      } catch (erro) {
        avisar.erro(mensagemDoErro(erro, 'Não deu para carregar a lista.'))
      } finally {
        setCarregando(false)
      }
    },
    [tipo, busca],
  )

  useEffect(() => {
    const t = setTimeout(() => void recarregar(), busca ? 250 : 0)
    return () => clearTimeout(t)
  }, [recarregar, busca])
  useAutoRefresh(useCallback(() => void recarregar(true), [recarregar]))

  const abrir = (p: Parceiro | 'novo') => {
    setEditando(p)
    setForm(p === 'novo' ? VAZIO : doRegistro(p))
  }
  const fechar = () => {
    setEditando(null)
    setForm(VAZIO)
  }
  const muda = (campo: keyof Formulario) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }))

  const salvar = async () => {
    setSalvando(true)
    try {
      if (editando === 'novo') await api.post(`/${tipo}`, form)
      else if (editando) await api.put(`/${tipo}/${editando.id}`, form)
      avisar.ok(`${form.nome} salvo.`)
      fechar()
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para salvar.'))
    } finally {
      setSalvando(false)
    }
  }

  const lerCartao = async () => {
    try {
      const { data } = await api.post<{ cadastro: Record<string, string | null> }>(`/${tipo}/ler-cartao`, {
        texto: textoCartao,
      })
      const c = data.cadastro
      // o cartão preenche; o que a pessoa já tinha digitado e o cartão não traz fica
      setForm((f) => ({
        ...f,
        nome: c.nome ?? f.nome,
        documento: c.documento ?? f.documento,
        email: c.email ?? f.email,
        telefone: c.telefone ?? f.telefone,
        endereco: c.endereco ?? f.endereco,
        bairro: c.bairro ?? f.bairro,
        cidade: c.cidade ?? f.cidade,
        uf: c.uf ?? f.uf,
        cep: c.cep ?? f.cep,
        atividade: c.atividade ?? f.atividade,
        porte: c.porte ?? f.porte,
        situacao: c.situacao ?? f.situacao,
        dataAbertura: dataDoCartao(c.dataAbertura) || f.dataAbertura,
        observacao: c.observacao ?? f.observacao,
      }))
      setCartaoAberto(false)
      setTextoCartao('')
      avisar.ok('Cartão lido. Confira os campos antes de salvar.')
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para ler o cartão.'))
    }
  }

  const apagar = async () => {
    if (!apagando) return
    try {
      await api.delete(`/${tipo}/${apagando.id}`)
      avisar.ok(`${apagando.nome} apagado.`)
      setApagando(null)
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para apagar.'))
      setApagando(null)
    }
  }

  const usos = (p: Parceiro) => (tipo === 'clientes' ? p._count?.encomendas ?? 0 : p._count?.materias ?? 0)

  return (
    <>
      <CabecalhoPagina
        titulo="Clientes e fornecedores"
        descricao="Cole o cartão CNPJ da Receita e o formulário se preenche sozinho. Encomenda com o nome de um cliente cadastrado fica ligada a ele."
        acoes={
          <Botao onClick={() => abrir('novo')} className="justify-center">
            <Plus size={16} /> Novo {singular}
          </Botao>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="tablist" className="inline-flex rounded-xl border border-borda bg-superficie p-1">
          {(['clientes', 'fornecedores'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tipo === t}
              onClick={() => setTipo(t)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                tipo === t ? 'bg-marca text-contraste' : 'text-tinta-fraca hover:text-tinta'
              }`}
            >
              {t === 'clientes' ? 'Clientes' : 'Fornecedores'}
            </button>
          ))}
        </div>
        <div className="sm:w-72">
          <Input placeholder="Buscar por nome ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      {carregando ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <Vazio
          icone={<Building2 size={22} />}
          titulo={busca ? 'Nada encontrado' : `Nenhum ${singular} cadastrado`}
          descricao={busca ? 'Tente parte do nome ou só os números do CNPJ.' : 'Cole o cartão CNPJ e o cadastro sai em segundos.'}
          acao={!busca && <Botao onClick={() => abrir('novo')}>Cadastrar {singular}</Botao>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((p) => (
            <Card key={p.id} className={p.ativo ? '' : 'opacity-60'}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-tinta" title={p.nome}>{p.nome}</p>
                  <p className="text-xs text-tinta-fraca">{p.documento ?? 'sem documento'}</p>
                </div>
                {!p.ativo && <Etiqueta>inativo</Etiqueta>}
              </div>
              <div className="mt-2 space-y-0.5 text-xs text-tinta-fraca">
                {p.telefone && <p>{p.telefone}</p>}
                {p.email && <p className="truncate">{p.email}</p>}
                {(p.cidade || p.uf) && <p>{[p.cidade, p.uf].filter(Boolean).join(' / ')}</p>}
                <p>
                  {usos(p)} {tipo === 'clientes' ? (usos(p) === 1 ? 'encomenda' : 'encomendas') : usos(p) === 1 ? 'matéria-prima' : 'matérias-primas'}
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                <Botao variante="secundario" onClick={() => abrir(p)} aria-label={`Editar ${p.nome}`}>
                  <Pencil size={14} /> Editar
                </Botao>
                <Botao variante="fantasma" onClick={() => setApagando(p)} aria-label={`Apagar ${p.nome}`}>
                  <Trash2 size={14} />
                </Botao>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        aberto={editando !== null}
        aoFechar={fechar}
        titulo={editando === 'novo' ? `Novo ${singular}` : `Editar ${singular}`}
        descricao="Só o nome é obrigatório."
        largura="max-w-2xl"
        fecharClicandoFora={false}
      >
        <div className="flex flex-col gap-4">
          <Botao variante="secundario" onClick={() => setCartaoAberto(true)} className="justify-center">
            <ClipboardPaste size={16} /> Preencher pelo cartão CNPJ
          </Botao>

          <Campo rotulo="Nome" dica="O nome como o ateliê chama no dia a dia (o fantasia, quando houver).">
            <Input caixaAlta value={form.nome} onChange={muda('nome')} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="CNPJ ou CPF"><Input value={form.documento} onChange={muda('documento')} /></Campo>
            <Campo rotulo="Telefone"><Input value={form.telefone} onChange={muda('telefone')} /></Campo>
            <Campo rotulo="E-mail"><Input type="email" value={form.email} onChange={muda('email')} /></Campo>
            <Campo rotulo="CEP"><Input value={form.cep} onChange={muda('cep')} /></Campo>
          </div>
          <Campo rotulo="Endereço"><Input value={form.endereco} onChange={muda('endereco')} /></Campo>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_5rem]">
            <Campo rotulo="Bairro"><Input value={form.bairro} onChange={muda('bairro')} /></Campo>
            <Campo rotulo="Cidade"><Input value={form.cidade} onChange={muda('cidade')} /></Campo>
            <Campo rotulo="UF"><Input value={form.uf} maxLength={2} onChange={muda('uf')} /></Campo>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Situação na Receita"><Input value={form.situacao} onChange={muda('situacao')} /></Campo>
            <Campo rotulo="Porte"><Input value={form.porte} onChange={muda('porte')} /></Campo>
            <Campo rotulo="Aberta em"><Input type="date" value={form.dataAbertura} onChange={muda('dataAbertura')} /></Campo>
          </div>
          <Campo rotulo="Atividade principal"><Input value={form.atividade} onChange={muda('atividade')} /></Campo>
          <Campo rotulo="Observação"><Textarea rows={3} value={form.observacao} onChange={muda('observacao')} /></Campo>
          <label className="flex items-center gap-2 text-sm text-tinta">
            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))} />
            Ativo
          </label>
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" onClick={fechar} disabled={salvando}>Cancelar</Botao>
            <Botao onClick={salvar} disabled={salvando || !form.nome.trim()}>{salvando ? 'Salvando…' : 'Salvar'}</Botao>
          </div>
        </div>
      </Modal>

      <Modal
        aberto={cartaoAberto}
        aoFechar={() => { setCartaoAberto(false); setTextoCartao('') }}
        titulo="Colar cartão CNPJ"
        descricao="Abra o PDF do Comprovante de Inscrição da Receita, selecione tudo (Cmd+A), copie e cole aqui."
        largura="max-w-xl"
      >
        <div className="flex flex-col gap-4">
          <Campo rotulo="Texto do cartão">
            <Textarea rows={10} value={textoCartao} onChange={(e) => setTextoCartao(e.target.value)} />
          </Campo>
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" onClick={() => { setCartaoAberto(false); setTextoCartao('') }}>Cancelar</Botao>
            <Botao onClick={lerCartao} disabled={textoCartao.trim().length < 20}>Ler cartão</Botao>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        aberto={apagando !== null}
        titulo={`Apagar ${apagando?.nome ?? ''}?`}
        mensagem={`Só dá para apagar quem não tem histórico. Com ${tipo === 'clientes' ? 'encomenda' : 'matéria-prima'} ligada, desative pelo Editar.`}
        textoConfirmar="Apagar"
        perigo
        aoConfirmar={apagar}
        aoCancelar={() => setApagando(null)}
      />
    </>
  )
}
