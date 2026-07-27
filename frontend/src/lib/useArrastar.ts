import { useCallback, useEffect, useRef, useState } from 'react'

/*
 * ARRASTAR CARTÃO ENTRE COLUNAS.
 *
 * Pointer Events, e não o drag-and-drop nativo do HTML5, por um motivo simples:
 * o HTML5 DnD não existe no toque. A Vera e o oleiro usam o quadro no celular
 * dentro do ateliê — um arrasto só de mouse seria um recurso que a maior parte
 * do uso real não alcança.
 *
 * Sem biblioteca porque o problema é pequeno: pegar um cartão e soltar numa
 * coluna. Não há lista reordenável nem arrastar entre janelas. dnd-kit
 * resolveria, mas são ~35 kB num app que abre no 4G do ateliê — e os botões do
 * cartão continuam existindo, então quem usa teclado nunca fica sem caminho.
 *
 * ── TRÊS COISAS QUE SÓ APARECERAM TESTANDO NO NAVEGADOR ──
 *
 * 1. NO DEDO, PRECISA SEGURAR ANTES. Andar alguns pixels É o gesto de rolar a
 *    tela. A primeira versão ligava `touch-action: none` quando o arrasto
 *    começava, e não funcionava: quando o movimento chega, o navegador já
 *    decidiu que aquilo é rolagem. Agora é pressionar-e-segurar, como o Trello:
 *    toque rápido rola, segurar levanta o cartão.
 *
 * 2. `setPointerCapture` NÃO BASTA NO TOQUE. Com a captura no cartão, o
 *    navegador entregava o primeiro `pointermove` e parava — ele assume o gesto
 *    para si. O que resolve é ouvir no `document` e barrar o `touchmove` com
 *    `preventDefault` (listener não-passivo) enquanto o arrasto está ativo. É o
 *    mesmo caminho que as bibliotecas sérias tomam, e pelo mesmo motivo.
 *
 * 3. `scroll-snap` BRIGA COM ROLAGEM AUTOMÁTICA. O trilho usa
 *    `scroll-snap-type: x proximity` para as colunas pararem alinhadas, e cada
 *    empurrão de poucos pixels era puxado de volta ao ponto de encaixe. O
 *    quadro ficava parado, parecendo que a rolagem de borda nem existia.
 */

/** Quanto o ponteiro precisa andar até virar arrasto, no mouse. */
const FOLGA_PX = 8
/** Quanto tempo o dedo fica parado no cartão até ele levantar. */
const ESPERA_TOQUE_MS = 260
/** Faixa junto à borda que puxa o quadro enquanto se arrasta. */
const BORDA_ROLAGEM_PX = 72
/** Pixels por quadro na rolagem automática. */
const VELOCIDADE_ROLAGEM = 14

export type EstadoArrasto<T> = {
  /** o que está sendo arrastado; null quando ninguém está arrastando */
  item: T | null
  /** id do alvo sob o ponteiro agora, se ele aceitar o item */
  alvo: string | null
  /** posição do ponteiro, para desenhar o cartão fantasma */
  x: number
  y: number
}

type Opcoes<T> = {
  /** devolve os ids que ESTE item aceita como destino */
  destinosDe: (item: T) => string[]
  /** chamado ao soltar sobre um alvo válido */
  aoSoltar: (item: T, alvoId: string) => void
  /**
   * O trilho que rola sozinho quando o ponteiro chega perto da borda.
   *
   * Sem isto o arrasto só alcança a coluna que já está na tela — e num celular
   * de 390px cabe uma coluna e meia das sete. Arrastar viraria recurso de
   * desktop, justamente onde ele menos importa.
   */
  trilho?: React.RefObject<HTMLElement | null>
}

export function useArrastar<T>({ destinosDe, aoSoltar, trilho }: Opcoes<T>) {
  const [estado, setEstado] = useState<EstadoArrasto<T>>({ item: null, alvo: null, x: 0, y: 0 })

  const inicio = useRef<{ x: number; y: number; item: T; alvos: string[] } | null>(null)
  const ativo = useRef(false)
  const relogio = useRef<number | null>(null)
  const quadro = useRef<number | null>(null)
  const direcao = useRef(0)
  const limpar = useRef<(() => void) | null>(null)

  const aoSoltarRef = useRef(aoSoltar)
  aoSoltarRef.current = aoSoltar

  /**
   * O alvo sai do DOM (`data-alvo-arrasto`), e não de uma lista de retângulos
   * guardada em estado — assim o quadro pode rolar no meio do arrasto sem as
   * áreas de soltar saírem do lugar.
   */
  const alvoSob = useCallback((x: number, y: number, permitidos: string[]) => {
    const el = document
      .elementsFromPoint(x, y)
      .find((n) => n instanceof HTMLElement && n.dataset.alvoArrasto) as HTMLElement | undefined
    const id = el?.dataset.alvoArrasto
    return id && permitidos.includes(id) ? id : null
  }, [])

  const pararRolagem = useCallback(() => {
    if (quadro.current) cancelAnimationFrame(quadro.current)
    quadro.current = null
    direcao.current = 0
    if (trilho?.current) trilho.current.style.scrollSnapType = ''
  }, [trilho])

  const rolarSePerto = useCallback(
    (x: number) => {
      const el = trilho?.current
      if (!el) return
      const r = el.getBoundingClientRect()
      direcao.current = x < r.left + BORDA_ROLAGEM_PX ? -1 : x > r.right - BORDA_ROLAGEM_PX ? 1 : 0
      if (direcao.current === 0) {
        if (quadro.current) cancelAnimationFrame(quadro.current)
        quadro.current = null
        return
      }
      if (quadro.current) return
      // sem desligar o snap, cada empurrão é puxado de volta ao encaixe
      el.style.scrollSnapType = 'none'
      const passo = () => {
        const alvoEl = trilho?.current
        if (direcao.current === 0 || !alvoEl) {
          quadro.current = null
          return
        }
        alvoEl.scrollLeft += direcao.current * VELOCIDADE_ROLAGEM
        quadro.current = requestAnimationFrame(passo)
      }
      quadro.current = requestAnimationFrame(passo)
    },
    [trilho],
  )

  const encerrar = useCallback(() => {
    if (relogio.current) window.clearTimeout(relogio.current)
    relogio.current = null
    limpar.current?.()
    limpar.current = null
    pararRolagem()
    inicio.current = null
    ativo.current = false
    document.body.style.userSelect = ''
    setEstado({ item: null, alvo: null, x: 0, y: 0 })
  }, [pararRolagem])

  /**
   * Passa a ouvir no DOCUMENTO. É o ponto central: com os listeners presos ao
   * cartão (mesmo com pointer capture), o navegador entrega o primeiro
   * movimento no toque e para. Aqui também entra o `touchmove` não-passivo que
   * impede o navegador de assumir o gesto como rolagem.
   */
  const comecar = useCallback(() => {
    ativo.current = true
    document.body.style.userSelect = 'none'

    const mover = (e: PointerEvent) => {
      const i = inicio.current
      if (!i) return
      rolarSePerto(e.clientX)
      setEstado({
        item: i.item,
        alvo: alvoSob(e.clientX, e.clientY, i.alvos),
        x: e.clientX,
        y: e.clientY,
      })
    }
    const soltar = (e: PointerEvent) => {
      const i = inicio.current
      const alvo = i ? alvoSob(e.clientX, e.clientY, i.alvos) : null
      encerrar()
      if (i && alvo) aoSoltarRef.current(i.item, alvo)
    }
    // não-passivo de propósito: é este preventDefault que segura a rolagem
    const segurarToque = (e: TouchEvent) => e.preventDefault()

    document.addEventListener('pointermove', mover)
    document.addEventListener('pointerup', soltar)
    document.addEventListener('pointercancel', encerrar)
    document.addEventListener('touchmove', segurarToque, { passive: false })

    limpar.current = () => {
      document.removeEventListener('pointermove', mover)
      document.removeEventListener('pointerup', soltar)
      document.removeEventListener('pointercancel', encerrar)
      document.removeEventListener('touchmove', segurarToque)
    }
  }, [alvoSob, encerrar, rolarSePerto])

  /** Liga o cartão ao arrasto. Espalhe no elemento que deve ser pego. */
  const pegar = useCallback(
    (item: T) => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return
        // clique em botão de dentro do cartão não vira arrasto
        if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return

        const toque = e.pointerType === 'touch' || e.pointerType === 'pen'
        const x = e.clientX
        const y = e.clientY
        inicio.current = { x, y, item, alvos: destinosDe(item) }

        if (!toque) {
          // no mouse o gatilho é andar alguns pixels — esperar seria lento
          const espiar = (ev: PointerEvent) => {
            if (Math.hypot(ev.clientX - x, ev.clientY - y) < FOLGA_PX) return
            soltarEspias()
            const i = inicio.current
            if (!i) return
            comecar()
            setEstado({
              item: i.item,
              alvo: alvoSob(ev.clientX, ev.clientY, i.alvos),
              x: ev.clientX,
              y: ev.clientY,
            })
          }
          const desistir = () => {
            soltarEspias()
            inicio.current = null
          }
          const soltarEspias = () => {
            document.removeEventListener('pointermove', espiar)
            document.removeEventListener('pointerup', desistir)
          }
          document.addEventListener('pointermove', espiar)
          document.addEventListener('pointerup', desistir)
          return
        }

        // no dedo: segurar levanta o cartão; sair andando antes é rolagem
        const desistirSeAndar = (ev: PointerEvent) => {
          if (Math.hypot(ev.clientX - x, ev.clientY - y) > FOLGA_PX) cancelarEspera()
        }
        const cancelarEspera = () => {
          if (relogio.current) window.clearTimeout(relogio.current)
          relogio.current = null
          document.removeEventListener('pointermove', desistirSeAndar)
          document.removeEventListener('pointerup', cancelarEspera)
          document.removeEventListener('pointercancel', cancelarEspera)
          if (!ativo.current) inicio.current = null
        }
        document.addEventListener('pointermove', desistirSeAndar)
        document.addEventListener('pointerup', cancelarEspera)
        document.addEventListener('pointercancel', cancelarEspera)

        relogio.current = window.setTimeout(() => {
          document.removeEventListener('pointermove', desistirSeAndar)
          document.removeEventListener('pointerup', cancelarEspera)
          document.removeEventListener('pointercancel', cancelarEspera)
          const i = inicio.current
          if (!i) return
          comecar()
          // um toque curto de vibração diz "levantou" sem precisar olhar
          navigator.vibrate?.(12)
          setEstado({ item: i.item, alvo: alvoSob(x, y, i.alvos), x, y })
        }, ESPERA_TOQUE_MS)
      },
      /*
       * `pan-y` deixa o navegador com a rolagem vertical — a que mais importa
       * numa página comprida — e reserva o horizontal, que é onde as colunas
       * estão. Durante o arrasto, quem segura de verdade é o preventDefault do
       * touchmove; isto aqui é a camada de antes.
       */
      style: { touchAction: 'pan-y' } as const,
    }),
    [alvoSob, comecar, destinosDe],
  )

  // Esc cancela — arrasto sem saída é armadilha, ainda mais em tela sensível
  useEffect(() => {
    if (!estado.item) return
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') encerrar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [estado.item, encerrar])

  // se a tela desmontar no meio do arrasto, os listeners globais vão junto
  useEffect(() => () => encerrar(), [encerrar])

  return { estado, pegar, arrastando: estado.item !== null }
}
