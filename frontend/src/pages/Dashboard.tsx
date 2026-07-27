import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Boxes, Package, Palette, Users } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { plural } from '../lib/format'
import { avisar } from '../components/Toaster'
import { CabecalhoPagina, Card, Carregando } from '../components/ui'
import { useAuth } from '../store/auth'

type Resumo = {
  cadastros: {
    pecasAtivas: number
    pecasInativas: number
    cores: number
    coresAtivas: number
    responsaveis: number
    etapas: number
    materiasPrimas: number
  }
  pendencias: {
    semRoteiro: { id: string; nome: string; categoria: { nome: string } }[]
    semEsmalte: { id: string; nome: string; categoria: { nome: string } }[]
    semEtapaDeCor: { id: string; nome: string }[]
    etapaQueDefineCor: string | null
  }
  porCategoria: { id: string; nome: string; pecas: number }[]
  producao: {
    disponivel: boolean
    lotesAbertos: number
    lotesConcluidos: number
    emProducao: number
    emBiscoito: number
    prontos: number
    perdas30dias: number
  }
}

function Numero({
  icone: Icone,
  rotulo,
  valor,
  para,
  detalhe,
}: {
  icone: typeof Package
  rotulo: string
  valor: number
  para: string
  detalhe?: string
}) {
  return (
    <Link to={para} className="rounded-xl border border-borda bg-superficie p-4 transition hover:border-marca">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-marca/15 text-marca">
          <Icone size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-tight text-tinta">{valor}</p>
          <p className="truncate text-sm text-tinta-fraca">{rotulo}</p>
        </div>
      </div>
      {detalhe && <p className="mt-2 text-xs text-tinta-fraca">{detalhe}</p>}
    </Link>
  )
}

function ListaPendencia({
  titulo,
  explicacao,
  itens,
}: {
  titulo: string
  explicacao: string
  itens: { id: string; nome: string }[]
}) {
  if (itens.length === 0) return null
  return (
    <div className="rounded-lg border border-alerta/30 bg-alerta/5 p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-alerta">
        <AlertTriangle size={16} /> {titulo} ({itens.length})
      </p>
      <p className="mt-1 text-xs text-tinta-fraca">{explicacao}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {itens.map((i) => (
          <Link key={i.id} to="/pecas" className="rounded-full bg-superficie px-2 py-0.5 text-xs text-tinta hover:underline">
            {i.nome}
          </Link>
        ))}
      </div>
    </div>
  )
}

export function Dashboard() {
  const nome = useAuth((e) => e.perfil?.nome ?? '')
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [carregando, setCarregando] = useState(true)

  const recarregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const { data } = await api.get('/dashboard/resumo')
      setResumo(data)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para carregar o resumo.'))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  useAutoRefresh(useCallback(() => void recarregar(true), [recarregar]))

  if (carregando || !resumo) return <Carregando />

  const { cadastros, pendencias, porCategoria, producao } = resumo
  const totalPendencias =
    pendencias.semRoteiro.length + pendencias.semEsmalte.length + pendencias.semEtapaDeCor.length

  return (
    <>
      <CabecalhoPagina
        titulo={`Olá, ${nome.split(' ')[0]}`}
        descricao="O que está na linha agora e o que ainda falta configurar."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero
          icone={Package}
          rotulo="peças ativas"
          valor={cadastros.pecasAtivas}
          para="/pecas"
          detalhe={cadastros.pecasInativas > 0 ? `${cadastros.pecasInativas} inativa(s)` : undefined}
        />
        <Numero
          icone={Palette}
          rotulo="esmaltes"
          valor={cadastros.coresAtivas}
          para="/esmaltes"
          detalhe={cadastros.cores > cadastros.coresAtivas ? `${cadastros.cores - cadastros.coresAtivas} inativo(s)` : undefined}
        />
        <Numero icone={Users} rotulo="responsáveis" valor={cadastros.responsaveis} para="/responsaveis" />
        <Numero icone={Boxes} rotulo="etapas do fluxo" valor={cadastros.etapas} para="/etapas" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-1 text-lg font-semibold text-tinta">
            {totalPendencias === 0 ? 'Cadastro em ordem' : 'Falta configurar'}
          </h2>
          {totalPendencias === 0 ? (
            <p className="text-sm text-tinta-fraca">
              Toda peça ativa tem roteiro, passa pela etapa que define a cor e tem esmaltes associados. O
              planejamento tem tudo de que precisa.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-3">
              <ListaPendencia
                titulo="Peças sem roteiro"
                explicacao="Sem roteiro a peça não vira lote — não há por onde ela andar."
                itens={pendencias.semRoteiro}
              />
              <ListaPendencia
                titulo="Peças sem esmalte associado"
                explicacao="O planejamento raciocina por peça + cor. Sem cor, ela nunca aparece numa sugestão de esmaltação."
                itens={pendencias.semEsmalte}
              />
              <ListaPendencia
                titulo={`Roteiros que não passam por “${pendencias.etapaQueDefineCor ?? 'Esmaltação'}”`}
                explicacao="O lote chegaria ao fim sem cor definida e sairia do controle por esmalte."
                itens={pendencias.semEtapaDeCor}
              />
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 text-lg font-semibold text-tinta">Peças por categoria</h2>
          <ul className="flex flex-col gap-1.5">
            {porCategoria.map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-tinta">{c.nome}</span>
                <span className="text-tinta-fraca">{plural(c.pecas, 'peça', 'peças')}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-tinta">Produção agora</h2>
          <Link to="/producao" className="text-sm text-tinta-fraca underline hover:text-tinta">
            abrir o quadro
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Lotes abertos', producao.lotesAbertos, ''],
            ['Em produção', producao.emProducao, 'peças a caminho'],
            ['Em biscoito', producao.emBiscoito, 'sem cor, prontas para esmaltar'],
            ['Prontas', producao.prontos, ''],
            ['Lotes concluídos', producao.lotesConcluidos, ''],
            ['Perdas 30 dias', producao.perdas30dias, ''],
          ].map(([rotulo, valor, ajuda]) => (
            <div key={String(rotulo)} className="rounded-lg bg-superficie-2 p-3">
              <p className="text-xl font-semibold text-tinta">{valor}</p>
              <p className="text-xs text-tinta-fraca">{rotulo}</p>
              {ajuda && <p className="mt-0.5 text-[11px] text-tinta-fraca">{ajuda}</p>}
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
