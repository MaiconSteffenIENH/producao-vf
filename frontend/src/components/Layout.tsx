import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  History,
  LayoutDashboard,
  Store,
  Tags,
  LogOut,
  Menu,
  Moon,
  Package,
  Palette,
  Settings,
  Shapes,
  Search,
  Sun,
  Users,
  Wrench,
  Boxes,
  Flame,
  Camera,
  ClipboardCheck,
  TrendingUp,
} from 'lucide-react'
import { useAuth } from '../store/auth'
import { EVENTO_ATUALIZAR } from '../lib/useAutoRefresh'
import { TECLA_ATALHO } from '../lib/plataforma'
import { Tecla } from './ui'
import { AvisoFila } from './AvisoFila'

type ItemMenu = { para: string; rotulo: string; icone: typeof Package; somenteAdmin?: boolean }
type GrupoMenu = { titulo: string; itens: ItemMenu[] }

const GRUPOS: GrupoMenu[] = [
  {
    titulo: 'Produção',
    itens: [
      { para: '/', rotulo: 'Início', icone: LayoutDashboard },
      { para: '/planejamento', rotulo: 'Planejamento', icone: ClipboardList },
      { para: '/producao', rotulo: 'Quadro de produção', icone: Boxes },
      { para: '/meu-dia', rotulo: 'Tarefas do dia', icone: CalendarCheck },
      { para: '/forno', rotulo: 'Forno', icone: Flame },
      { para: '/encomendas', rotulo: 'Encomendas', icone: ClipboardCheck },
      { para: '/fotos', rotulo: 'Fotos', icone: Camera },
      { para: '/historico', rotulo: 'Histórico', icone: History },
      { para: '/pecas', rotulo: 'Peças', icone: Package },
    ],
  },
  {
    titulo: 'Preços',
    itens: [
      { para: '/vendas', rotulo: 'Vendas e cobertura', icone: TrendingUp },
      { para: '/precos', rotulo: 'Preços por canal', icone: Tags },
      { para: '/canais', rotulo: 'Canais de venda', icone: Store },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { para: '/esmaltes', rotulo: 'Esmaltes', icone: Palette },
      { para: '/categorias', rotulo: 'Categorias', icone: Shapes },
      { para: '/responsaveis', rotulo: 'Responsáveis', icone: Users },
      { para: '/etapas', rotulo: 'Etapas', icone: Wrench },
      { para: '/materias-primas', rotulo: 'Matérias-primas', icone: Package },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { para: '/usuarios', rotulo: 'Usuários', icone: Users, somenteAdmin: true },
      { para: '/ajustes', rotulo: 'Ajustes', icone: Settings },
    ],
  },
]

const CHAVE_TEMA = 'vf.tema'

function usarTema() {
  const [escuro, setEscuro] = useState(() => localStorage.getItem(CHAVE_TEMA) === 'escuro')
  useEffect(() => {
    document.documentElement.classList.toggle('dark', escuro)
    localStorage.setItem(CHAVE_TEMA, escuro ? 'escuro' : 'claro')
  }, [escuro])
  return { escuro, alternar: () => setEscuro((v) => !v) }
}

/** Puxar-pra-atualizar: dispara o evento que o useAutoRefresh escuta. */
function usarPuxarParaAtualizar() {
  useEffect(() => {
    let inicioY = 0
    let ativo = false
    const aoTocar = (e: TouchEvent) => {
      ativo = window.scrollY <= 0
      inicioY = e.touches[0].clientY
    }
    const aoSoltar = (e: TouchEvent) => {
      if (!ativo) return
      const distancia = e.changedTouches[0].clientY - inicioY
      if (distancia > 90 && window.scrollY <= 0) window.dispatchEvent(new Event(EVENTO_ATUALIZAR))
      ativo = false
    }
    window.addEventListener('touchstart', aoTocar, { passive: true })
    window.addEventListener('touchend', aoSoltar, { passive: true })
    return () => {
      window.removeEventListener('touchstart', aoTocar)
      window.removeEventListener('touchend', aoSoltar)
    }
  }, [])
}

function Marca({ compacto = false }: { compacto?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {/* Agora que a lateral é clara, o selo é o bloco de cor da marca. Antes
          ele era um vazado branco porque a lateral inteira já era areia. */}
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-marca shadow-baixa">
        <span className="font-titulo text-[15px] leading-none tracking-tight text-contraste">VF</span>
      </span>
      {!compacto && (
        <span className="leading-tight">
          <span className="block font-titulo text-[15px] text-tinta">Vera Flesch</span>
          <span className="block text-[10px] uppercase tracking-[0.22em] text-tinta-fraca">Produção</span>
        </span>
      )}
    </div>
  )
}

function Navegacao({ aoNavegar }: { aoNavegar?: () => void }) {
  const admin = useAuth((e) => e.perfil?.admin ?? false)
  const [abertos, setAbertos] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('vf.menu') ?? '{}')
    } catch {
      return {}
    }
  })

  const alternar = (titulo: string) =>
    setAbertos((a) => {
      const novo = { ...a, [titulo]: a[titulo] === false }
      localStorage.setItem('vf.menu', JSON.stringify(novo))
      return novo
    })

  return (
    <nav className="flex flex-col gap-0.5 px-3 pb-6">
      {GRUPOS.map((grupo) => {
        const itens = grupo.itens.filter((i) => !i.somenteAdmin || admin)
        if (itens.length === 0) return null
        const aberto = abertos[grupo.titulo] !== false
        return (
          <div key={grupo.titulo}>
            <button
              onClick={() => alternar(grupo.titulo)}
              className="mt-3 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-tinta-fraca transition hover:text-tinta"
            >
              {grupo.titulo}
              <ChevronDown size={14} className={`transition ${aberto ? '' : '-rotate-90'}`} />
            </button>
            {aberto &&
              itens.map((item) => (
                <NavLink
                  key={item.para}
                  to={item.para}
                  end={item.para === '/'}
                  onClick={aoNavegar}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200 ${
                      // sólido, não transparência: areia sobre areia dava
                      // 3,09:1. Assim passa em 4,54:1 e ainda devolve à lateral
                      // um bloco da cor da marca, que era o que o fundo areia
                      // fazia antes — só que num pedaço só, onde tem função.
                      isActive
                        ? 'bg-marca font-medium text-contraste shadow-baixa'
                        : 'text-tinta-fraca hover:bg-tinta/6 hover:text-tinta'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* marcador que sangra para fora do bloco: dá o mesmo
                          "você está aqui" das abas de um caderno */}
                      <span
                        className={`absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-marca transition-all duration-200 ${
                          isActive ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <item.icone size={17} className="shrink-0" />
                      {item.rotulo}
                    </>
                  )}
                </NavLink>
              ))}
          </div>
        )
      })}
    </nav>
  )
}

export function Layout() {
  const { perfil, sair } = useAuth()
  const { escuro, alternar } = usarTema()
  const [menuAberto, setMenuAberto] = useState(false)
  const [perfilAberto, setPerfilAberto] = useState(false)
  const caixaPerfil = useRef<HTMLDivElement>(null)
  const navegar = useNavigate()
  const local = useLocation()

  usarPuxarParaAtualizar()

  useEffect(() => setMenuAberto(false), [local.pathname])

  // Fecha por pointerdown no documento — backdrop fixo não cobre a tela toda
  // dentro da topbar no mobile e o dropdown ficava preso aberto.
  useEffect(() => {
    if (!perfilAberto) return
    const aoApontar = (e: PointerEvent) => {
      if (!caixaPerfil.current?.contains(e.target as Node)) setPerfilAberto(false)
    }
    document.addEventListener('pointerdown', aoApontar)
    return () => document.removeEventListener('pointerdown', aoApontar)
  }, [perfilAberto])

  const sairAgora = () => {
    sair()
    navegar('/entrar')
  }

  return (
    <div className="min-h-screen bg-fundo lg:flex">
      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-borda bg-lateral lg:flex">
        <div className="px-5 py-5">
          <Marca />
        </div>
        <div className="mx-3 h-px bg-borda" />
        <div className="flex-1 overflow-y-auto">
          <Navegacao />
        </div>
      </aside>

      {/* Menu — mobile */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden" onPointerDown={() => setMenuAberto(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside
            className="anima-lateral absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-borda bg-lateral"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-5">
              <Marca />
            </div>
            <Navegacao aoNavegar={() => setMenuAberto(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-borda bg-lateral/85 px-4 py-2.5 backdrop-blur-md">
          <button
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
            className="rounded-lg p-1.5 text-tinta hover:bg-tinta/8 lg:hidden"
          >
            <Menu size={22} />
          </button>
          <div className="lg:hidden">
            <Marca compacto />
          </div>

          {/* busca global — atalho ensinado na própria tecla */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('vf:abrir-paleta'))}
            className="ml-auto flex items-center gap-2 rounded-xl border border-borda bg-superficie px-3 py-1.5 text-sm text-tinta-fraca shadow-baixa transition hover:border-marca-clara hover:text-tinta"
          >
            <Search size={16} />
            <span className="hidden sm:inline">Buscar</span>
            <span className="hidden lg:inline">
              <Tecla>{TECLA_ATALHO}</Tecla>
            </span>
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={alternar}
              aria-label={escuro ? 'Tema claro' : 'Tema escuro'}
              className="rounded-lg p-2 text-tinta-fraca transition hover:bg-tinta/8 hover:text-tinta"
            >
              {escuro ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div className="relative" ref={caixaPerfil}>
              <button
                onClick={() => setPerfilAberto((v) => !v)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-tinta transition hover:bg-tinta/8"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-marca text-xs font-semibold text-contraste">
                  {perfil?.nome?.[0]?.toUpperCase() ?? '?'}
                </span>
                <span className="hidden sm:inline">{perfil?.nome}</span>
                <ChevronDown size={14} className="text-tinta-fraca" />
              </button>
              {perfilAberto && (
                <div className="anima-surgir absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-borda bg-superficie shadow-alta">
                  <div className="border-b border-borda px-3 py-2">
                    <p className="truncate text-sm font-medium text-tinta">{perfil?.nome}</p>
                    <p className="truncate text-xs text-tinta-fraca">{perfil?.email}</p>
                    <p className="mt-1 text-xs text-tinta-fraca">Papel: {perfil?.papel}</p>
                  </div>
                  <button
                    onClick={sairAgora}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-tinta hover:bg-superficie-2"
                  >
                    <LogOut size={16} /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/*
          1600 e não 1152: o quadro de produção tem 7 etapas lado a lado e cada
          coluna cortada é um lote que ninguém vê. Nas telas de texto o
          CabecalhoPagina já segura a linha num comprimento legível.
        */}
        <main className="relative z-10 mx-auto w-full max-w-[100rem] flex-1 px-4 py-7 sm:px-6">
          <AvisoFila />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
