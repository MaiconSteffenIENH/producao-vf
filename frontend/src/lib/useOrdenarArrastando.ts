import { useCallback, useEffect, useRef, useState } from 'react'

/*
 * ARRASTAR A LINHA PARA MUDAR A ORDEM DA LISTA.
 *
 * Em Etapas e Categorias a ordem era um número digitado dentro do modal de
 * edição. Trocar duas de lugar exigia abrir uma, mudar o número, salvar, abrir
 * a outra e mudar o número — decorando de cabeça quem tinha qual. O gesto de
 * pegar a linha e levar para cima diz a mesma coisa, e é o gesto que a Vera já
 * usa no quadro de produção.
 *
 * É PRIMO DO `useArrastar`, NÃO CÓPIA. Lá se arrasta um cartão ENTRE colunas e
 * o destino é um alvo desenhado na tela; aqui a lista é uma só e o que importa
 * é a POSIÇÃO entre duas linhas. Alvo diferente, medida diferente, estado
 * diferente. O que se repete são os três problemas que só aparecem no
 * navegador de verdade — e a solução deles é a mesma, de propósito, porque ela
 * já foi validada no dedo dentro do ateliê:
 *
 *   1. NO DEDO, PRESSIONAR-E-SEGURAR. Aqui isso pesa mais do que no quadro: a
 *      lista rola na MESMA direção em que se arrasta. Sem a espera, cada
 *      tentativa de rolar a página levantaria uma linha e bagunçaria a ordem
 *      que a pessoa só queria ler.
 *   2. LISTENERS NO `document`, e `touchmove` não-passivo com preventDefault
 *      enquanto arrasta. `setPointerCapture` entrega o primeiro movimento no
 *      toque e o navegador assume o gesto para si.
 *   3. NO MOUSE BASTA ANDAR ~8px — esperar seria lentidão sem motivo, já que
 *      o mouse não rola a página segurando o botão.
 *
 * ── O QUE ESTE ARQUIVO RESOLVE E O OUTRO NÃO ──
 *
 * A LISTA NÃO SE MEXE ENQUANTO SE ARRASTA. A linha-guia mostra onde a linha
 * vai cair e as posições continuam onde estavam. Abrir espaço de verdade era a
 * alternativa, e ela se morde: mexer nas linhas muda os retângulos que estão
 * sendo medidos, e perto da fronteira entre duas posições isso vira tremor —
 * a linha pisca entre dois lugares e o dedo não consegue escolher.
 *
 * ROLAGEM DE BORDA É OBRIGATÓRIA, não enfeite. Enquanto o arrasto está ativo o
 * `preventDefault` mata a rolagem nativa; sem empurrar a página perto da borda,
 * arrastar para uma posição fora da tela seria impossível — e num celular de
 * 390px cabem umas seis linhas de onze.
 *
 * SETAS TAMBÉM REORDENAM. Quem chega no punho pelo teclado (ou por leitor de
 * tela) sobe e desce a linha com ↑ e ↓. Arrasto sozinho é um caminho que só
 * existe para quem consegue arrastar.
 */

/** Quanto o ponteiro precisa andar até virar arrasto, no mouse. */
const FOLGA_PX = 8
/** Quanto tempo o dedo fica parado na linha até ela levantar. */
const ESPERA_TOQUE_MS = 260
/** Faixa junto à borda da janela que puxa a página enquanto se arrasta. */
const BORDA_ROLAGEM_PX = 72
/** Pixels por quadro na rolagem automática. */
const VELOCIDADE_ROLAGEM = 12

/** Nenhuma posição em vista — vale para "não está arrastando". */
const SEM_ALVO = -1

type Opcoes = {
  /** os ids na ordem em que aparecem na tela, de cima para baixo */
  ids: string[]
  /** chamado ao soltar, só quando a ordem realmente mudou */
  aoSoltar: (idsNaNovaOrdem: string[]) => void
  /** como a linha se chama para quem não a está vendo */
  rotuloDe: (id: string) => string
  /** onde estão as linhas: é aqui dentro que os retângulos são medidos */
  area: React.RefObject<HTMLElement | null>
  /** desligue quando reordenar não fizer sentido (lista filtrada, por exemplo) */
  habilitado?: boolean
}

type Estado = {
  /** id da linha levantada; null quando ninguém está arrastando */
  id: string | null
  /** onde ela cai: índice de INSERÇÃO, de 0 (antes da primeira) a n (no fim) */
  alvo: number
}

/**
 * A lista com `id` levado para `destino`. Devolve null quando nada muda — é o
 * que evita gravar um arrasto que voltou para o mesmo lugar.
 */
export function reposicionar(ids: string[], id: string, destino: number): string[] | null {
  const de = ids.indexOf(id)
  if (de < 0 || destino < 0 || destino >= ids.length || destino === de) return null
  const novos = [...ids]
  novos.splice(de, 1)
  novos.splice(destino, 0, id)
  return novos
}

/*
 * Uma região viva só, criada quando o teclado é usado pela primeira vez.
 *
 * Mover pelo teclado sem isto é mover às cegas: a posição muda, o rótulo do
 * botão muda junto, mas nada é FALADO — mudar atributo de elemento já
 * existente não dispara anúncio. Ela vive no <body> porque precisa sobreviver
 * ao re-render que reposiciona a linha.
 */
let regiaoViva: HTMLElement | null = null
function anunciar(texto: string) {
  if (typeof document === 'undefined') return
  if (!regiaoViva) {
    regiaoViva = document.createElement('div')
    regiaoViva.setAttribute('role', 'status')
    regiaoViva.setAttribute('aria-live', 'polite')
    regiaoViva.className = 'sr-only'
    document.body.appendChild(regiaoViva)
  }
  regiaoViva.textContent = texto
}

export function useOrdenarArrastando({ ids, aoSoltar, rotuloDe, area, habilitado = true }: Opcoes) {
  const [estado, setEstado] = useState<Estado>({ id: null, alvo: SEM_ALVO })

  // o que muda a cada render vive em ref: os listeners são presos uma vez só
  const idsRef = useRef(ids)
  idsRef.current = ids
  const aoSoltarRef = useRef(aoSoltar)
  aoSoltarRef.current = aoSoltar
  const rotuloRef = useRef(rotuloDe)
  rotuloRef.current = rotuloDe

  const inicio = useRef<{ id: string } | null>(null)
  const ativo = useRef(false)
  const relogio = useRef<number | null>(null)
  const quadro = useRef<number | null>(null)
  const direcao = useRef(0)
  const ultimoY = useRef(0)
  const alvoAtual = useRef(SEM_ALVO)
  const limpar = useRef<(() => void) | null>(null)

  /**
   * A posição sai do DOM (`data-ordenar-id`) a cada movimento, e não de uma
   * lista de retângulos medida no começo: a página rola durante o arrasto — por
   * rolagem de borda ou porque o teclado do celular fechou — e retângulo velho
   * faria a linha cair um lugar longe de onde o dedo está.
   */
  const posicaoSob = useCallback(
    (y: number) => {
      const linhas = Array.from(area.current?.querySelectorAll<HTMLElement>('[data-ordenar-id]') ?? [])
      for (let i = 0; i < linhas.length; i++) {
        const r = linhas[i].getBoundingClientRect()
        if (y < r.top + r.height / 2) return i
      }
      return linhas.length
    },
    [area],
  )

  /** Só troca o estado quando a POSIÇÃO muda — não a cada pixel andado. */
  const atualizarAlvo = useCallback(
    (y: number) => {
      ultimoY.current = y
      const alvo = posicaoSob(y)
      if (alvo === alvoAtual.current) return
      alvoAtual.current = alvo
      const i = inicio.current
      if (i) setEstado({ id: i.id, alvo })
    },
    [posicaoSob],
  )

  const pararRolagem = useCallback(() => {
    if (quadro.current) cancelAnimationFrame(quadro.current)
    quadro.current = null
    direcao.current = 0
  }, [])

  const rolarSePerto = useCallback(
    (y: number) => {
      direcao.current = y < BORDA_ROLAGEM_PX ? -1 : y > window.innerHeight - BORDA_ROLAGEM_PX ? 1 : 0
      if (direcao.current === 0) {
        if (quadro.current) cancelAnimationFrame(quadro.current)
        quadro.current = null
        return
      }
      if (quadro.current) return
      const passo = () => {
        if (direcao.current === 0) {
          quadro.current = null
          return
        }
        window.scrollBy(0, direcao.current * VELOCIDADE_ROLAGEM)
        // a lista andou debaixo de um dedo parado: a posição muda sem movimento
        atualizarAlvo(ultimoY.current)
        quadro.current = requestAnimationFrame(passo)
      }
      quadro.current = requestAnimationFrame(passo)
    },
    [atualizarAlvo],
  )

  const encerrar = useCallback(() => {
    if (relogio.current) window.clearTimeout(relogio.current)
    relogio.current = null
    limpar.current?.()
    limpar.current = null
    pararRolagem()
    inicio.current = null
    ativo.current = false
    alvoAtual.current = SEM_ALVO
    document.body.style.userSelect = ''
    setEstado({ id: null, alvo: SEM_ALVO })
  }, [pararRolagem])

  /**
   * O clique que nasce ao soltar o mouse não pode chegar nos botões da linha.
   * A linha tem "editar" e "excluir" na ponta direita: terminar um arrasto em
   * cima deles abriria a confirmação de exclusão sem ninguém ter pedido.
   */
  const engolirProximoClique = () => {
    const engolir = (e: MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
    }
    document.addEventListener('click', engolir, true)
    // só o clique DESTE gesto; o próximo de verdade tem de passar
    window.setTimeout(() => document.removeEventListener('click', engolir, true), 0)
  }

  /**
   * Passa a ouvir no DOCUMENTO. É o ponto central: com os listeners presos à
   * linha (mesmo com pointer capture), o navegador entrega o primeiro
   * movimento no toque e para. Aqui também entra o `touchmove` não-passivo que
   * impede o gesto de virar rolagem.
   */
  const comecar = useCallback(() => {
    ativo.current = true
    document.body.style.userSelect = 'none'

    const mover = (e: PointerEvent) => {
      if (!inicio.current) return
      rolarSePerto(e.clientY)
      atualizarAlvo(e.clientY)
    }
    const soltar = () => {
      const i = inicio.current
      const alvo = alvoAtual.current
      encerrar()
      if (!i || alvo === SEM_ALVO) return
      engolirProximoClique()
      const atuais = idsRef.current
      const de = atuais.indexOf(i.id)
      // o índice de inserção conta com a linha ainda no lugar; tirando-a de
      // lá, tudo o que estava abaixo sobe uma casa
      const novos = reposicionar(atuais, i.id, alvo > de ? alvo - 1 : alvo)
      if (novos) aoSoltarRef.current(novos)
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
  }, [atualizarAlvo, encerrar, rolarSePerto])

  const aoApontar = useCallback(
    (id: string) => (e: React.PointerEvent) => {
      if (e.button !== 0) return
      const alvo = e.target as HTMLElement
      // os botões da linha continuam sendo botões; o punho é a exceção, porque
      // ele existe justamente para ser o lugar óbvio de pegar
      if (!alvo.closest('[data-punho-arrasto]') && alvo.closest('button, a, input, select, textarea')) return

      const toque = e.pointerType === 'touch' || e.pointerType === 'pen'
      const x = e.clientX
      const y = e.clientY
      inicio.current = { id }
      ultimoY.current = y

      if (!toque) {
        // no mouse o gatilho é andar alguns pixels — esperar seria lento
        const espiar = (ev: PointerEvent) => {
          if (Math.hypot(ev.clientX - x, ev.clientY - y) < FOLGA_PX) return
          soltarEspias()
          if (!inicio.current) return
          comecar()
          atualizarAlvo(ev.clientY)
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

      // no dedo: segurar levanta a linha; sair andando antes é rolar a página
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
        if (!inicio.current) return
        comecar()
        // um toque curto de vibração diz "levantou" sem precisar olhar
        navigator.vibrate?.(12)
        atualizarAlvo(y)
      }, ESPERA_TOQUE_MS)
    },
    [atualizarAlvo, comecar],
  )

  /** Liga a linha ao arrasto. Espalhe no elemento da linha (o `<tr>`). */
  const pegar = useCallback(
    (id: string) => ({
      // é por este atributo que as posições são medidas
      'data-ordenar-id': id,
      onPointerDown: habilitado ? aoApontar(id) : undefined,
      /*
       * `pan-y` deixa o navegador rolar a página normalmente ANTES de a linha
       * levantar — é o que faz o toque rápido continuar rolando. Durante o
       * arrasto quem segura é o preventDefault do touchmove; isto aqui é a
       * camada de antes.
       */
      /*
       * `touch-action` NÃO vale em <tr>: a especificação exclui linha, grupo de
       * linha, coluna e grupo de coluna. Declarar aqui seria decoração. Quem
       * segura a rolagem durante o arrasto é o preventDefault do `touchmove`
       * não-passivo, e é ele que faz o gesto funcionar no dedo.
       */
    }),
    [aoApontar, habilitado],
  )

  /**
   * O punho: o ícone que anuncia "isto se arrasta". Espalhe num `<button>`.
   *
   * Ele carrega o rótulo que o leitor de tela lê e o teclado que substitui o
   * arrasto — sem ele, reordenar seria recurso de quem tem mão firme.
   */
  const punho = (id: string) => {
    const posicao = idsRef.current.indexOf(id)
    return {
      'data-punho-arrasto': id,
      type: 'button' as const,
      disabled: !habilitado,
      title: 'Arraste para reordenar',
      'aria-label':
        `Reordenar ${rotuloRef.current(id)}, posição ${posicao + 1} de ${idsRef.current.length}. ` +
        'Arraste para mover, ou use as setas para cima e para baixo.',
      onKeyDown: (e: React.KeyboardEvent) => {
        const passo = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
        if (!habilitado || passo === 0) return
        // cada passo é uma gravação; a repetição automática do teclado
        // dispararia dezenas por segundo na rede ruim do ateliê
        if (e.repeat) return
        // seta dentro de uma lista ordenável é reordenar, não rolar a página
        e.preventDefault()
        const atuais = idsRef.current
        const novos = reposicionar(atuais, id, atuais.indexOf(id) + passo)
        if (!novos) return
        aoSoltarRef.current(novos)
        /*
         * O FOCO PRECISA SER DEVOLVIDO NA MÃO.
         *
         * A lista re-renderiza e o React reposiciona a <tr> com insertBefore.
         * Elemento focado que sai do documento devolve o foco ao <body> — é
         * regra do HTML, não bug do React. Sem isto a seta funcionava UMA vez:
         * na segunda a página rolava, porque já não havia nada focado. Quem
         * depende do teclado ficaria preso depois do primeiro passo.
         */
        anunciar(`${rotuloRef.current(id)} agora na posição ${novos.indexOf(id) + 1} de ${novos.length}.`)
        requestAnimationFrame(() => {
          const alvo = document.querySelector<HTMLElement>(
            `[data-punho-arrasto="${CSS.escape(id)}"]`,
          )
          alvo?.focus()
        })
      },
    }
  }

  // Esc cancela — arrasto sem saída é armadilha, ainda mais em tela sensível
  useEffect(() => {
    if (!estado.id) return
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') encerrar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [estado.id, encerrar])

  // se a tela desmontar no meio do arrasto, os listeners globais vão junto
  useEffect(() => () => encerrar(), [encerrar])

  return {
    pegar,
    punho,
    /** id da linha levantada agora, para desenhá-la erguida */
    idArrastando: estado.id,
    /** onde a linha-guia é desenhada: índice de inserção, ou -1 */
    indiceAlvo: estado.id ? estado.alvo : SEM_ALVO,
    arrastando: estado.id !== null,
  }
}
