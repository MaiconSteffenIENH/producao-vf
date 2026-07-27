import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Boxes,
  CalendarCheck,
  ClipboardList,
  CornerDownLeft,
  History,
  LayoutDashboard,
  Package,
  Palette,
  Search,
  Settings,
  Shapes,
  Store,
  Tags,
  Users,
  Wrench,
} from 'lucide-react'
import { api } from '../services/api'
import { normalizarBusca } from '../lib/format'
import { Tecla } from './ui'

/*
 * Busca única por Cmd+K.
 *
 * Num sistema com quinze telas, o menu deixa de escalar: a pessoa sabe o que
 * quer ("xícara andorinha", "planejamento") e não onde isso mora. Aqui ela
 * digita o nome e chega — sem aprender a árvore de navegação.
 *
 * Peças e esmaltes são carregados uma vez ao abrir e filtrados na memória:
 * são dezenas de registros, não milhares, e busca sem espera parece instantânea.
 */

type Item = {
  id: string
  titulo: string
  subtitulo: string
  grupo: string
  destino: string
  icone: typeof Package
}

const TELAS: Item[] = [
  { id: 't-inicio', titulo: 'Início', subtitulo: 'Visão geral', grupo: 'Ir para', destino: '/', icone: LayoutDashboard },
  { id: 't-plan', titulo: 'Planejamento', subtitulo: 'O que produzir agora', grupo: 'Ir para', destino: '/planejamento', icone: ClipboardList },
  { id: 't-prod', titulo: 'Quadro de produção', subtitulo: 'Onde cada lote está', grupo: 'Ir para', destino: '/producao', icone: Boxes },
  { id: 't-dia', titulo: 'Tarefas do dia', subtitulo: 'Meta e fila de cada um', grupo: 'Ir para', destino: '/meu-dia', icone: CalendarCheck },
  { id: 't-hist', titulo: 'Histórico', subtitulo: 'Todos os lotes', grupo: 'Ir para', destino: '/historico', icone: History },
  { id: 't-pecas', titulo: 'Peças', subtitulo: 'Cadastro e roteiros', grupo: 'Ir para', destino: '/pecas', icone: Package },
  { id: 't-precos', titulo: 'Preços por canal', subtitulo: 'Custo real e margem', grupo: 'Ir para', destino: '/precos', icone: Tags },
  { id: 't-canais', titulo: 'Canais de venda', subtitulo: 'Comissões e taxas', grupo: 'Ir para', destino: '/canais', icone: Store },
  { id: 't-esm', titulo: 'Esmaltes', subtitulo: 'Cores disponíveis', grupo: 'Ir para', destino: '/esmaltes', icone: Palette },
  { id: 't-resp', titulo: 'Responsáveis', subtitulo: 'Quem faz cada etapa', grupo: 'Ir para', destino: '/responsaveis', icone: Users },
  { id: 't-etapas', titulo: 'Etapas', subtitulo: 'Fluxo de produção', grupo: 'Ir para', destino: '/etapas', icone: Wrench },
  { id: 't-cat', titulo: 'Categorias', subtitulo: 'Grupos de peças', grupo: 'Ir para', destino: '/categorias', icone: Shapes },
  { id: 't-mp', titulo: 'Matérias-primas', subtitulo: 'Estoque de insumos', grupo: 'Ir para', destino: '/materias-primas', icone: Package },
  { id: 't-aj', titulo: 'Ajustes', subtitulo: 'Senha e perfil', grupo: 'Ir para', destino: '/ajustes', icone: Settings },
]

export function PaletaComando() {
  const [aberta, setAberta] = useState(false)
  const [busca, setBusca] = useState('')
  const [marcado, setMarcado] = useState(0)
  const [doBanco, setDoBanco] = useState<Item[]>([])
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  const navegar = useNavigate()

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAberta((v) => !v)
      }
      if (e.key === 'Escape') setAberta(false)
    }
    const aoPedir = () => setAberta(true)
    document.addEventListener('keydown', aoTeclar)
    window.addEventListener('vf:abrir-paleta', aoPedir)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      window.removeEventListener('vf:abrir-paleta', aoPedir)
    }
  }, [])

  useEffect(() => {
    if (!aberta) return
    setBusca('')
    setMarcado(0)
    setTimeout(() => campo.current?.focus(), 10)
    if (doBanco.length > 0) return

    Promise.all([api.get('/pecas'), api.get('/cores')])
      .then(([p, c]) => {
        const pecas: Item[] = p.data.map((x: { id: string; nome: string; categoria?: { nome: string } }) => ({
          id: `p-${x.id}`,
          titulo: x.nome,
          subtitulo: x.categoria?.nome ?? 'Peça',
          grupo: 'Peças',
          destino: '/pecas',
          icone: Package,
        }))
        const cores: Item[] = c.data.map((x: { id: string; nome: string }) => ({
          id: `c-${x.id}`,
          titulo: x.nome,
          subtitulo: 'Esmalte',
          grupo: 'Esmaltes',
          destino: '/esmaltes',
          icone: Palette,
        }))
        setDoBanco([...pecas, ...cores])
      })
      .catch(() => setDoBanco([])) // sem rede a paleta ainda navega entre telas
  }, [aberta, doBanco.length])

  const resultados = useMemo(() => {
    const alvo = normalizarBusca(busca)
    const todos = [...TELAS, ...doBanco]
    if (!alvo) return TELAS.slice(0, 7)
    return todos
      .filter((i) => normalizarBusca(`${i.titulo} ${i.subtitulo}`).includes(alvo))
      .slice(0, 12)
  }, [busca, doBanco])

  const escolher = useCallback(
    (item: Item) => {
      setAberta(false)
      navegar(item.destino)
    },
    [navegar],
  )

  useEffect(() => {
    if (!aberta) return
    const aoNavegar = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMarcado((m) => (m + 1) % Math.max(1, resultados.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMarcado((m) => (m - 1 + resultados.length) % Math.max(1, resultados.length))
      } else if (e.key === 'Enter' && resultados[marcado]) {
        e.preventDefault()
        escolher(resultados[marcado])
      }
    }
    document.addEventListener('keydown', aoNavegar)
    return () => document.removeEventListener('keydown', aoNavegar)
  }, [aberta, resultados, marcado, escolher])

  // mantém o item marcado visível quando se navega só pelo teclado
  useEffect(() => {
    lista.current?.querySelector('[data-marcado="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [marcado])

  if (!aberta) return null

  let grupoAnterior = ''

  return (
    <div
      className="anima-aparecer fixed inset-0 z-[70] flex items-start justify-center bg-[#2b2725]/45 p-4 pt-[12vh] backdrop-blur-[2px]"
      onPointerDown={(e) => e.target === e.currentTarget && setAberta(false)}
    >
      <div className="anima-modal w-full max-w-xl overflow-hidden rounded-2xl border border-borda bg-superficie shadow-alta">
        <div className="flex items-center gap-3 border-b border-borda px-4">
          <Search size={18} className="shrink-0 text-tinta-fraca" />
          <input
            ref={campo}
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setMarcado(0)
            }}
            placeholder="Buscar tela, peça ou esmalte…"
            className="w-full bg-transparent py-4 text-tinta outline-none placeholder:text-tinta-fraca"
          />
          <Tecla>esc</Tecla>
        </div>

        <div ref={lista} className="max-h-[52vh] overflow-y-auto p-2">
          {resultados.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-tinta-fraca">Nada com esse nome.</p>
          )}

          {resultados.map((item, i) => {
            const novoGrupo = item.grupo !== grupoAnterior
            grupoAnterior = item.grupo
            const Icone = item.icone
            return (
              <div key={item.id}>
                {novoGrupo && (
                  <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-widest text-tinta-fraca">
                    {item.grupo}
                  </p>
                )}
                <button
                  data-marcado={i === marcado}
                  onMouseEnter={() => setMarcado(i)}
                  onClick={() => escolher(item)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    i === marcado ? 'bg-marca/12' : 'hover:bg-superficie-2'
                  }`}
                >
                  <Icone size={16} className="shrink-0 text-tinta-fraca" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-tinta">{item.titulo}</span>
                    <span className="block truncate text-xs text-tinta-fraca">{item.subtitulo}</span>
                  </span>
                  {i === marcado && <CornerDownLeft size={14} className="shrink-0 text-tinta-fraca" />}
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between border-t border-borda px-4 py-2.5 text-xs text-tinta-fraca">
          <span className="flex items-center gap-1.5">
            <Tecla>↑</Tecla>
            <Tecla>↓</Tecla>
            navegar
          </span>
          <span className="flex items-center gap-1.5">
            <Tecla>↵</Tecla>
            abrir
          </span>
        </div>
      </div>
    </div>
  )
}
