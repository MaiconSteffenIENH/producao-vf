/*
 * QUEM PODE ROLAR A PÁGINA ENQUANTO UMA JANELA ESTÁ ABERTA.
 *
 * Com a janela aberta, o fundo não deve rolar: o dedo no celular arrasta a
 * lista de trás em vez do conteúdo da janela. A forma óbvia de fazer isso é
 * cada janela guardar o `overflow` que encontrou e devolvê-lo ao fechar.
 *
 * ── POR QUE A FORMA ÓBVIA QUEBRA ──
 *
 * Ela quebra assim que existe JANELA DENTRO DE JANELA — o cadastro rápido de
 * argila abre por cima do cadastro de peça. Com as duas abertas:
 *
 *   1. a de fora abre, encontra "" e escreve "hidden";
 *   2. a de dentro abre, encontra "hidden" e escreve "hidden";
 *   3. QUALQUER re-render (digitar uma letra no campo já basta) faz o React
 *      refazer os dois efeitos: primeiro os dois cleanups, depois os dois
 *      setups. No segundo setup, a de FORA também encontra "hidden";
 *   4. fecham as duas, e as duas "restauram" hidden.
 *
 * A partir daí NENHUMA tela do sistema rola, em nenhuma rota, até a pessoa
 * recarregar a página. Foi exatamente o que aconteceu na tela de Ajustes.
 *
 * ── A FORMA QUE NÃO QUEBRA ──
 *
 * O valor original é guardado UMA vez, quando a primeira janela abre, e
 * devolvido UMA vez, quando a última fecha. O contador é a fonte da verdade;
 * nenhuma janela guarda estado próprio, então não há o que envenenar.
 *
 * Puro de propósito: recebe o alvo em vez de falar com `document` direto, o
 * que permite exercitar a sequência acima sem navegador.
 */

export type AlvoDaTrava = { style: { overflow: string } }

let abertas = 0
let overflowOriginal = ''

/**
 * Trava a rolagem do alvo e devolve a função que a libera.
 *
 * A função devolvida é segura para chamar mais de uma vez: React pode rodar o
 * mesmo cleanup duas vezes, e um contador que aceita decremento repetido
 * liberaria a rolagem com uma janela ainda aberta.
 */
export function travarRolagem(alvo: AlvoDaTrava): () => void {
  if (abertas === 0) overflowOriginal = alvo.style.overflow
  abertas++
  alvo.style.overflow = 'hidden'

  let jaLiberou = false
  return () => {
    if (jaLiberou) return
    jaLiberou = true
    abertas--
    if (abertas === 0) alvo.style.overflow = overflowOriginal
  }
}

/**
 * Há alguma janela aberta?
 *
 * O auto-refresh consulta isto para não recarregar a lista por baixo de quem
 * está preenchendo uma confirmação — no quadro de produção, que atualiza
 * sozinho a cada 15 segundos, isso apagaria a quantidade já digitada.
 */
export const temJanelaAberta = () => abertas > 0

/** Só para exercitar a sequência em teste; não usar na aplicação. */
export function reiniciarTravaDeRolagem() {
  abertas = 0
  overflowOriginal = ''
}
