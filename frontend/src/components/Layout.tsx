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
  Sun,
  Users,
  Wrench,
  Boxes,
} from 'lucide-react'
import { useAuth } from '../store/auth'
import { EVENTO_ATUALIZAR } from '../lib/useAutoRefresh'

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
      { para: '/historico', rotulo: 'Histórico', icone: History },
      { para: '/pecas', rotulo: 'Peças', icone: Package },
    ],
  },
  {
    titulo: 'Preços',
    itens: [
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
    <div className="flex items-center gap-2">
      <span className="font-titulo text-xl leading-none text-ouro">VF</span>
      {!compacto && (
        <span className="leading-tight">
          <span className="block text-sm font-medium text-contraste">Vera Flesch</span>
          <span className="block text-[11px] uppercase tracking-widest text-contraste/70">Produção</span>
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
    <nav className="flex flex-col gap-1 p-3">
      {GRUPOS.map((grupo) => {
        const itens = grupo.itens.filter((i) => !i.somenteAdmin || admin)
        if (itens.length === 0) return null
        const aberto = abertos[grupo.titulo] !== false
        return (
          <div key={grupo.titulo}>
            <button
              onClick={() => alternar(grupo.titulo)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-contraste/60 hover:text-contraste"
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
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      isActive ? 'bg-contraste/20 font-medium text-contraste' : 'text-contraste/80 hover:bg-contraste/10'
                    }`
                  }
                >
                  <item.icone size={18} />
                  {item.rotulo}
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
      <aside className="hidden w-64 shrink-0 bg-marca lg:block">
        <div className="px-5 py-5">
          <Marca />
        </div>
        <Navegacao />
      </aside>

      {/* Menu — mobile */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden" onPointerDown={() => setMenuAberto(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside
            className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-marca"
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
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-marca px-4 py-3">
          <button
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
            className="rounded-lg p-1.5 text-contraste hover:bg-contraste/10 lg:hidden"
          >
            <Menu size={22} />
          </button>
          <div className="lg:hidden">
            <Marca compacto />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={alternar}
              aria-label={escuro ? 'Tema claro' : 'Tema escuro'}
              className="rounded-lg p-2 text-contraste hover:bg-contraste/10"
            >
              {escuro ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div className="relative" ref={caixaPerfil}>
              <button
                onClick={() => setPerfilAberto((v) => !v)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-contraste hover:bg-contraste/10"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-contraste/20 text-xs font-semibold">
                  {perfil?.nome?.[0]?.toUpperCase() ?? '?'}
                </span>
                <span className="hidden sm:inline">{perfil?.nome}</span>
                <ChevronDown size={14} />
              </button>
              {perfilAberto && (
                // popover nasce dentro do header (sempre escuro) mas mostra
                // conteúdo — usa as cores de conteúdo, não as do header
                <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-borda bg-superficie shadow-xl">
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

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
