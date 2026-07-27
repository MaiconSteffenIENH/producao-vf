import { forwardRef, useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/*
 * ATENÇÃO — largura de campo.
 * Input/Select/NumeroInput têm `w-full` na classe base, e a base vem DEPOIS do
 * className recebido, então ela vence. Para largura custom, embrulhe:
 *   ERRADO: <Select className="w-56" />
 *   CERTO:  <div className="w-56"><Select /></div>
 */

const baseCampo =
  'w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-tinta placeholder:text-tinta-fraca ' +
  'outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/30 disabled:opacity-60'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => <input ref={ref} {...props} className={`${className} ${baseCampo}`} />,
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => <textarea ref={ref} {...props} className={`${className} ${baseCampo}`} />,
)
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, ...props }, ref) => (
    <select ref={ref} {...props} className={`${className} ${baseCampo}`}>
      {children}
    </select>
  ),
)
Select.displayName = 'Select'

export function Campo({
  rotulo,
  erro,
  dica,
  children,
}: {
  rotulo: string
  erro?: string
  dica?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-tinta">{rotulo}</span>
      {children}
      {dica && !erro && <span className="mt-1 block text-xs text-tinta-fraca">{dica}</span>}
      {erro && <span className="mt-1 block text-xs text-perigo">{erro}</span>}
    </label>
  )
}

type VarianteBotao = 'primario' | 'secundario' | 'perigo' | 'fantasma'

const variantes: Record<VarianteBotao, string> = {
  // text-contraste é sempre o contraste correto do sólido, nos dois temas
  primario: 'bg-marca text-contraste hover:bg-marca-escura',
  secundario: 'border border-borda bg-superficie text-tinta hover:bg-superficie-2',
  perigo: 'bg-perigo text-contraste hover:opacity-90',
  fantasma: 'text-tinta hover:bg-superficie-2',
}

export function Botao({
  variante = 'primario',
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBotao }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
        transition disabled:cursor-not-allowed disabled:opacity-60 ${variantes[variante]} ${className}`}
    >
      {children}
    </button>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-borda bg-superficie p-4 ${className}`}>{children}</div>
}

/**
 * Cabeçalho de página. No mobile o título ocupa a largura e as ações vão
 * abaixo; no desktop volta a ser lado a lado. `flex items-center justify-between`
 * puro espremeria o título na vertical no celular.
 */
export function CabecalhoPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-tinta">{titulo}</h1>
        {descricao && <p className="mt-0.5 text-sm text-tinta-fraca">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  )
}

/** Registro global de modais abertos — o polling pausa enquanto houver algum. */
let modaisAbertos = 0
export const temModalAberto = () => modaisAbertos > 0

export function Modal({
  aberto,
  aoFechar,
  titulo,
  largura = 'max-w-2xl',
  children,
}: {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  largura?: string
  children: ReactNode
}) {
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    modaisAbertos++
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', aoTeclar)
    const overflowAntes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      modaisAbertos--
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAntes
    }
  }, [aberto, aoFechar])

  if (!aberto) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (!caixa.current?.contains(e.target as Node)) aoFechar()
      }}
    >
      <div
        ref={caixa}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-superficie shadow-xl sm:rounded-2xl ${largura}`}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-borda bg-superficie px-4 py-3">
          <h2 className="text-lg font-semibold text-tinta">{titulo}</h2>
          <button onClick={aoFechar} aria-label="Fechar" className="rounded-lg p-1 text-tinta-fraca hover:bg-superficie-2">
            <X size={20} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function Vazio({ titulo, descricao, acao }: { titulo: string; descricao?: string; acao?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-borda px-6 py-12 text-center">
      <p className="font-medium text-tinta">{titulo}</p>
      {descricao && <p className="mx-auto mt-1 max-w-md text-sm text-tinta-fraca">{descricao}</p>}
      {acao && <div className="mt-4 flex justify-center">{acao}</div>}
    </div>
  )
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-tinta-fraca">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-marca border-t-transparent" />
      {texto}
    </div>
  )
}

export function Etiqueta({ children, cor }: { children: ReactNode; cor?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={cor ? { backgroundColor: `${cor}22`, color: cor } : undefined}
    >
      {children}
    </span>
  )
}

/**
 * Chip de esmalte. Mostra a foto de amostra quando existe, porque Branco e
 * Pedra Sabão têm praticamente a mesma cor média — só a textura diferencia.
 */
export function ChipCor({
  nome,
  hex,
  amostraUrl,
  malhado,
  tamanho = 20,
}: {
  nome: string
  hex: string
  amostraUrl?: string | null
  malhado?: boolean
  tamanho?: number
}) {
  return (
    <span className="inline-flex items-center gap-1.5" title={malhado ? `${nome} (malhado)` : nome}>
      <span
        className="inline-block shrink-0 rounded-full border border-borda bg-cover bg-center"
        style={{
          width: tamanho,
          height: tamanho,
          backgroundColor: hex,
          backgroundImage: amostraUrl ? `url(${amostraUrl})` : undefined,
        }}
      />
      <span className="text-sm text-tinta">{nome}</span>
    </span>
  )
}
