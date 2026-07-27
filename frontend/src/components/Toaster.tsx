import { create } from 'zustand'
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { useEffect } from 'react'

type Tipo = 'ok' | 'erro' | 'info'
type Aviso = { id: number; tipo: Tipo; texto: string }

type Estado = {
  avisos: Aviso[]
  mostrar: (tipo: Tipo, texto: string) => void
  fechar: (id: number) => void
}

let proximoId = 1

export const useAvisos = create<Estado>((set) => ({
  avisos: [],
  mostrar: (tipo, texto) => set((e) => ({ avisos: [...e.avisos, { id: proximoId++, tipo, texto }] })),
  fechar: (id) => set((e) => ({ avisos: e.avisos.filter((a) => a.id !== id) })),
}))

export const avisar = {
  ok: (texto: string) => useAvisos.getState().mostrar('ok', texto),
  erro: (texto: string) => useAvisos.getState().mostrar('erro', texto),
  info: (texto: string) => useAvisos.getState().mostrar('info', texto),
}

const icones = { ok: CheckCircle2, erro: AlertTriangle, info: Info }
const cores: Record<Tipo, string> = {
  ok: 'border-verde/40 text-verde',
  erro: 'border-perigo/40 text-perigo',
  info: 'border-borda text-tinta',
}

function Item({ aviso }: { aviso: Aviso }) {
  const fechar = useAvisos((e) => e.fechar)
  useEffect(() => {
    const t = setTimeout(() => fechar(aviso.id), aviso.tipo === 'erro' ? 7000 : 4000)
    return () => clearTimeout(t)
  }, [aviso.id, aviso.tipo, fechar])

  const Icone = icones[aviso.tipo]
  return (
    <button
      onClick={() => fechar(aviso.id)}
      className={`flex w-full items-start gap-2 rounded-lg border bg-superficie px-3 py-2 text-left text-sm shadow-lg ${cores[aviso.tipo]}`}
    >
      <Icone size={18} className="mt-0.5 shrink-0" />
      <span className="text-tinta">{aviso.texto}</span>
    </button>
  )
}

export function Toaster() {
  const avisos = useAvisos((e) => e.avisos)
  if (avisos.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-sm flex-col gap-2">
        {avisos.map((a) => (
          <Item key={a.id} aviso={a} />
        ))}
      </div>
    </div>
  )
}
