import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { caixaAltaAoDigitar } from '../lib/nomes'
import { interpretarNumero, podeDigitar, textoDoNumero } from '../lib/numero'

/*
 * ATENÇÃO — largura de campo.
 * Input/Select/Textarea têm `w-full` na classe base, e a base vem DEPOIS do
 * className recebido, então ela vence. Para largura custom, embrulhe:
 *   ERRADO: <Select className="w-56" />
 *   CERTO:  <div className="w-56"><Select /></div>
 */

const baseCampo =
  'w-full rounded-xl border border-borda bg-superficie px-3.5 py-2.5 text-tinta placeholder:text-tinta-fraca ' +
  'outline-none transition-[border-color,box-shadow,background-color] duration-200 ' +
  'hover:border-marca-clara focus:border-marca focus:ring-4 focus:ring-marca/12 ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

/*
 * `caixaAlta` liga o campo de NOME: o texto vira maiúscula sozinho, sem caps
 * lock.
 *
 * A conversão acontece ao SAIR DO CAMPO, e não a cada tecla. Tentei a cada
 * tecla primeiro, apostando que maiúscula em português não muda o comprimento
 * do texto (ç→Ç, ã→Ã) e por isso o cursor ficaria quieto. Não fica: reescrever
 * o valor dentro do onChange faz o React reposicionar o cursor no fim depois
 * de renderizar, e guardar/devolver a posição não resolveu de forma confiável.
 * Digitando "de" no meio de "PRATO PÃO" saía "PRATO DPÃOE".
 *
 * Campo que briga com quem digita é pior do que campo que não ajuda. No blur o
 * cursor já saiu, então não há o que atrapalhar — e o resultado para quem usa é
 * o mesmo: ninguém precisa segurar o shift.
 *
 * `text-transform` mostra o efeito enquanto se digita, e `autoCapitalize`
 * manda o teclado do celular já abrir em maiúscula. O VALOR é convertido de
 * verdade no blur: só o CSS deixaria o banco com o texto minúsculo, a lista
 * pareceria certa e a busca não acharia.
 */
export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { caixaAlta?: boolean }
>(({ className = '', caixaAlta: emCaixaAlta = false, onChange, onBlur, style, ...props }, ref) => (
  <input
    ref={ref}
    {...props}
    autoCapitalize={emCaixaAlta ? 'characters' : props.autoCapitalize}
    style={emCaixaAlta ? { textTransform: 'uppercase', ...style } : style}
    onChange={onChange}
    onBlur={(e) => {
      if (emCaixaAlta && onChange) {
        const arrumado = caixaAltaAoDigitar(e.target.value)
        if (arrumado !== e.target.value) {
          e.target.value = arrumado
          onChange(e as unknown as React.ChangeEvent<HTMLInputElement>)
        }
      }
      onBlur?.(e)
    }}
    className={`${className} ${baseCampo}`}
  />
))
Input.displayName = 'Input'

/*
 * CAMPO DE NÚMERO — o que o `<input type="number">` sozinho não resolve.
 *
 * O defeito que motivou isto tem três caras, e todas vinham do mesmo lugar: o
 * estado guardava NÚMERO e o campo devolvia TEXTO.
 *
 *   1. Apagar tudo com o backspace deixava "0" no campo, porque `Number('')`
 *      é zero. Não dá para esvaziar um campo numérico — e "0" é um valor, não
 *      a ausência dele.
 *   2. Com o "0" preso ali, digitar 123 escrevia ao lado: "0123".
 *   3. Clicar num campo que vale 20 e digitar 25 produzia 2025, quando a
 *      intenção óbvia é trocar o número.
 *
 * A correção é guardar TEXTO aqui dentro e entregar número para fora. O DOM
 * passa a mostrar exatamente o que a pessoa digitou — inclusive vazio — e quem
 * chama recebe `null` quando não há número, em vez de um zero inventado.
 *
 * Selecionar tudo ao focar é o que faz "clico e escrevo 25" virar 25. É o
 * comportamento de campo de quantidade em qualquer lugar que se digita rápido,
 * e no ateliê se digita com barro na mão.
 */

export const InputNumero = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
    valor: number | null | undefined
    aoMudar: (valor: number | null) => void
    /** casas decimais permitidas; zero (o padrão) aceita só inteiro */
    decimais?: number
  }
>(({ valor, aoMudar, decimais = 0, min = 0, className = '', onFocus, onBlur, ...props }, ref) => {
  const [texto, setTexto] = useState(() => textoDoNumero(valor))
  /*
   * O CLIQUE PODE DESFAZER A SELEÇÃO, e os navegadores discordam sobre isso.
   *
   * A ordem dos eventos é mousedown → focus → mouseup → click. Selecionar tudo
   * no `focus` funciona, mas o `mouseup` seguinte pode colocar o cursor onde o
   * dedo caiu e desfazer a seleção — trazendo de volta o defeito original: clico
   * no campo que vale 20, escrevo 25 e sai 2025. O Chromium daqui não desfaz;
   * o Safari, que é o navegador do ateliê, é conhecido por desfazer. Segurar o
   * `mouseup` custa nada e tira a diferença do caminho.
   *
   * A bandeira segura o `mouseup` do PRIMEIRO clique, o que entra no campo. Do
   * segundo em diante ele passa — porque clicar de novo num campo já em foco é
   * a pessoa querendo posicionar o cursor para corrigir um dígito, e roubar
   * isso dela seria trocar um incômodo por outro.
   */
  const primeiroClique = useRef(false)

  /*
   * O valor pode mudar POR FORA — reset do formulário, troca de lote, resposta
   * do servidor. Só sobrescreve o texto quando o número que ele representa é
   * outro: sem essa condição, digitar "1" num campo que já vale 1 devolveria o
   * texto antigo e o cursor pularia.
   */
  useEffect(() => {
    setTexto((atual) => (interpretarNumero(atual) === (valor ?? null) ? atual : textoDoNumero(valor)))
  }, [valor])

  return (
    <input
      ref={ref}
      {...props}
      type="text"
      inputMode={decimais > 0 ? 'decimal' : 'numeric'}
      value={texto}
      /*
       * `type="text"` e não `"number"`, de propósito. O campo numérico do
       * navegador entrega string vazia para qualquer coisa que ele considere
       * inválida — inclusive "-" e "1e" no meio da digitação — e aí não há como
       * distinguir "apagou tudo" de "está escrevendo". Com texto filtrado por
       * regex, o sinal de menos simplesmente não entra: negativo aqui nunca é
       * intenção, é erro de digitação.
       */
      onChange={(e) => {
        const bruto = e.target.value
        if (!podeDigitar(bruto, decimais)) return
        setTexto(bruto)
        aoMudar(interpretarNumero(bruto))
      }}
      // clicar já seleciona: escrever substitui em vez de emendar
      onFocus={(e) => {
        e.target.select()
        primeiroClique.current = true
        onFocus?.(e)
      }}
      onMouseUp={(e) => {
        if (primeiroClique.current) {
          e.preventDefault()
          primeiroClique.current = false
        }
      }}
      onBlur={(e) => {
        // tira o zero à esquerda que sobra de "0" + "25"; campo vazio continua vazio
        const n = interpretarNumero(texto)
        const arrumado = textoDoNumero(n)
        if (arrumado !== texto) setTexto(arrumado)
        primeiroClique.current = false
        onBlur?.(e)
      }}
      aria-valuemin={typeof min === 'number' ? min : undefined}
      className={`${className} ${baseCampo}`}
    />
  )
})
InputNumero.displayName = 'InputNumero'

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea ref={ref} {...props} className={`${className} ${baseCampo} resize-y`} />
  ),
)
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, ...props }, ref) => (
    <select ref={ref} {...props} className={`${className} ${baseCampo} cursor-pointer appearance-none bg-no-repeat pr-9`}
      style={{
        // seta desenhada no próprio campo: a nativa muda de forma em cada
        // sistema e quebra a unidade visual entre mac, Windows e Android
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238a807c' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundPosition: 'right 0.85rem center',
      }}
    >
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
      <span className="mb-1.5 block text-sm font-medium text-tinta">{rotulo}</span>
      {children}
      {dica && !erro && <span className="mt-1.5 block text-xs leading-relaxed text-tinta-fraca">{dica}</span>}
      {erro && <span className="mt-1.5 block text-xs text-perigo">{erro}</span>}
    </label>
  )
}

type VarianteBotao = 'primario' | 'secundario' | 'perigo' | 'fantasma'

const variantes: Record<VarianteBotao, string> = {
  // text-contraste é sempre o contraste correto do sólido, nos dois temas
  primario: 'bg-marca text-contraste shadow-baixa hover:bg-marca-escura hover:shadow-media',
  secundario: 'border border-borda bg-superficie text-tinta hover:border-marca-clara hover:bg-superficie-2',
  perigo: 'bg-perigo text-contraste shadow-baixa hover:opacity-90 hover:shadow-media',
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
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium
        transition-all duration-200 active:scale-[0.98]
        disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100
        ${variantes[variante]} ${className}`}
    >
      {children}
    </button>
  )
}

export function Card({
  className = '',
  interativo = false,
  children,
}: {
  className?: string
  interativo?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={`rounded-2xl border border-borda bg-superficie p-5 shadow-baixa transition-all duration-200 ${
        interativo ? 'hover:-translate-y-0.5 hover:border-marca-clara hover:shadow-media' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * Cabeçalho de página. No mobile o título ocupa a largura e as ações vão
 * abaixo; no desktop volta a ser lado a lado. `flex items-center justify-between`
 * puro espremeria o título na vertical no celular.
 */
export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string
  descricao?: string
  acoes?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-titulo text-[1.75rem] leading-tight text-tinta">{titulo}</h1>
        {descricao && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-tinta-fraca">{descricao}</p>}
      </div>
      {/* no celular as ações viram grade de duas colunas: dois selects
          empilhados em largura total empurravam o conteúdo para fora da dobra */}
      {acoes && (
        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">{acoes}</div>
      )}
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
  descricao,
  largura = 'max-w-2xl',
  fecharClicandoFora = true,
  children,
}: {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  descricao?: string
  largura?: string
  /**
   * Clicar no escuro em volta fecha? Em janela com formulário preenchido, NÃO.
   *
   * No ateliê o quadro fica aberto em tela de toque o dia inteiro, e o dedo
   * encosta fora da janela sem querer o tempo todo — a confirmação sumia com
   * a quantidade e o esmalte já escolhidos, e a pessoa refazia tudo. Sair
   * continua a um toque de distância: o botão Cancelar, o X ou Esc. O que
   * deixa de existir é o jeito ACIDENTAL de sair.
   */
  fecharClicandoFora?: boolean
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

  /*
   * PORTAL PARA O <body>, e não uma div aqui dentro.
   *
   * O modal nascia dentro do <main>, que é `relative z-10` — e isso não é um
   * z-index qualquer: `position` + `z-index` abre um CONTEXTO DE EMPILHAMENTO.
   * Dentro dele, o z-50 do modal só disputa com os irmãos do próprio main; o
   * cabeçalho, que é `sticky z-30` mas mora FORA do main, ganhava sempre.
   * Resultado: toda janela abria com uma tarja acesa por cima, cobrindo o
   * título — não era só nos Canais de venda, era em todas.
   *
   * Aumentar o z-index do modal não resolveria nada: número maior dentro de um
   * contexto menor continua embaixo. O que resolve é sair do contexto, e é
   * exatamente para isso que o portal existe.
   */
  return createPortal(
    <div
      className="anima-aparecer fixed inset-0 z-50 flex items-end justify-center bg-[#2b2725]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (!fecharClicandoFora) return
        if (!caixa.current?.contains(e.target as Node)) aoFechar()
      }}
    >
      <div
        ref={caixa}
        className={`anima-modal max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-superficie shadow-alta sm:rounded-2xl ${largura}`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-borda bg-superficie/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="font-titulo text-xl leading-tight text-tinta">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-sm text-tinta-fraca">{descricao}</p>}
          </div>
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            className="-mr-1 shrink-0 rounded-lg p-1.5 text-tinta-fraca transition hover:bg-superficie-2 hover:text-tinta"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Estado vazio. Tela sem dado é onde a pessoa mais precisa de orientação e
 * onde a maioria dos sistemas entrega uma frase seca — aqui ele explica o que
 * aquilo seria e oferece o próximo passo.
 */
export function Vazio({
  titulo,
  descricao,
  acao,
  icone,
}: {
  titulo: string
  descricao?: string
  acao?: ReactNode
  icone?: ReactNode
}) {
  return (
    <div className="anima-surgir rounded-2xl border border-dashed border-borda bg-superficie/40 px-6 py-14 text-center">
      {icone && (
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-marca/10 text-marca">
          {icone}
        </div>
      )}
      <p className="font-titulo text-lg text-tinta">{titulo}</p>
      {descricao && <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-tinta-fraca">{descricao}</p>}
      {acao && <div className="mt-5 flex justify-center">{acao}</div>}
    </div>
  )
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="anima-aparecer flex items-center justify-center gap-3 py-16 text-sm text-tinta-fraca">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-marca border-t-transparent" />
      {texto}
    </div>
  )
}

/** Placeholder com a forma do conteúdo — some a sensação de tela travada. */
export function Esqueleto({ className = '' }: { className?: string }) {
  return <div className={`esqueleto ${className}`} />
}

export function Etiqueta({ children, cor }: { children: ReactNode; cor?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset"
      style={
        cor
          ? { backgroundColor: `${cor}14`, color: cor, ['--tw-ring-color' as string]: `${cor}33` }
          : undefined
      }
    >
      {children}
    </span>
  )
}

/**
 * Chip de esmalte. Mostra a foto de amostra quando existe, porque Branco e
 * Pedra Sabão têm praticamente a mesma cor média — só a textura diferencia.
 * O anel interno evita que esmalte claro suma no fundo branco do card.
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
        className="inline-block shrink-0 rounded-full bg-cover bg-center ring-1 ring-inset ring-black/10"
        style={{
          width: tamanho,
          height: tamanho,
          backgroundColor: hex,
          backgroundImage: amostraUrl ? `url(${amostraUrl})` : undefined,
          boxShadow: 'inset 0 1px 2px rgb(255 255 255 / 0.35)',
        }}
      />
      <span className="text-sm text-tinta">{nome}</span>
    </span>
  )
}

/** Atalho de teclado desenhado como tecla — ensina sem precisar de tutorial. */
export function Tecla({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-borda bg-superficie-2 px-1.5 py-0.5 font-sans text-[11px] font-medium text-tinta-fraca">
      {children}
    </kbd>
  )
}
