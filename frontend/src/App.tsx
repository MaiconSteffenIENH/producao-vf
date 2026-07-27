import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Toaster } from './components/Toaster'
import { PaletaComando } from './components/PaletaComando'
import { Carregando } from './components/ui'
import { useAuth } from './store/auth'
import { iniciarFilaOffline } from './lib/filaOffline'

// Toda página é chunk lazy — import estático volta pro bundle inicial e
// engorda o primeiro carregamento no 4G do ateliê.
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })))
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const Pecas = lazy(() => import('./pages/Pecas').then((m) => ({ default: m.Pecas })))
const Producao = lazy(() => import('./pages/Producao').then((m) => ({ default: m.Producao })))
const Planejamento = lazy(() => import('./pages/Planejamento').then((m) => ({ default: m.Planejamento })))
const MeuDia = lazy(() => import('./pages/MeuDia').then((m) => ({ default: m.MeuDia })))
const Queimas = lazy(() => import('./pages/Queimas').then((m) => ({ default: m.Queimas })))
const Vendas = lazy(() => import('./pages/Vendas').then((m) => ({ default: m.Vendas })))
const Fotos = lazy(() => import('./pages/Fotos').then((m) => ({ default: m.Fotos })))
const Encomendas = lazy(() => import('./pages/Encomendas').then((m) => ({ default: m.Encomendas })))
const Historico = lazy(() => import('./pages/Historico').then((m) => ({ default: m.Historico })))
const Precos = lazy(() => import('./pages/Precos').then((m) => ({ default: m.Precos })))
const Canais = lazy(() => import('./pages/Canais').then((m) => ({ default: m.Canais })))
const Esmaltes = lazy(() => import('./pages/Esmaltes').then((m) => ({ default: m.Esmaltes })))
const Categorias = lazy(() => import('./pages/Categorias').then((m) => ({ default: m.Categorias })))
const Responsaveis = lazy(() => import('./pages/Responsaveis').then((m) => ({ default: m.Responsaveis })))
const Etapas = lazy(() => import('./pages/Etapas').then((m) => ({ default: m.Etapas })))
const MateriasPrimas = lazy(() => import('./pages/MateriasPrimas').then((m) => ({ default: m.MateriasPrimas })))
const Usuarios = lazy(() => import('./pages/Usuarios').then((m) => ({ default: m.Usuarios })))
const Ajustes = lazy(() => import('./pages/Ajustes').then((m) => ({ default: m.Ajustes })))

function Protegida({ children }: { children: React.ReactNode }) {
  const { perfil, carregando } = useAuth()
  const local = useLocation()
  if (carregando) return <Carregando texto="Entrando…" />
  if (!perfil) return <Navigate to="/entrar" state={{ de: local.pathname }} replace />
  // senha provisória: não deixa circular antes de trocar
  if (perfil.precisaTrocarSenha && local.pathname !== '/ajustes') {
    return <Navigate to="/ajustes" replace />
  }
  return <>{children}</>
}

function SomenteAdmin({ children }: { children: React.ReactNode }) {
  const admin = useAuth((e) => e.perfil?.admin ?? false)
  if (!admin) return <Navigate to="/" replace />
  return <>{children}</>
}

export function App() {
  const recarregarPerfil = useAuth((e) => e.recarregarPerfil)
  useEffect(() => {
    void recarregarPerfil()
  }, [recarregarPerfil])

  // reenvio do que foi registrado sem sinal no ateliê
  useEffect(() => iniciarFilaOffline(), [])

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<Carregando />}>
          <Routes>
            <Route path="/entrar" element={<Login />} />
            <Route
              element={
                <Protegida>
                  <Layout />
                </Protegida>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/pecas" element={<Pecas />} />
              <Route path="/planejamento" element={<Planejamento />} />
              <Route path="/producao" element={<Producao />} />
              <Route path="/meu-dia" element={<MeuDia />} />
              <Route path="/forno" element={<Queimas />} />
              <Route path="/encomendas" element={<Encomendas />} />
              <Route path="/fotos" element={<Fotos />} />
              <Route path="/vendas" element={<Vendas />} />
              <Route path="/historico" element={<Historico />} />
              <Route path="/precos" element={<Precos />} />
              <Route path="/canais" element={<Canais />} />
              <Route path="/esmaltes" element={<Esmaltes />} />
              <Route path="/categorias" element={<Categorias />} />
              <Route path="/responsaveis" element={<Responsaveis />} />
              <Route path="/etapas" element={<Etapas />} />
              <Route path="/materias-primas" element={<MateriasPrimas />} />
              <Route
                path="/usuarios"
                element={
                  <SomenteAdmin>
                    <Usuarios />
                  </SomenteAdmin>
                }
              />
              <Route path="/ajustes" element={<Ajustes />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <PaletaComando />
        <Toaster />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
