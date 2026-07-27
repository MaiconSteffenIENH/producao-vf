/*
 * Mostrar "⌘K" para quem está no Windows é ensinar a tecla errada. A Vera está
 * no Mac, o pessoal do ateliê no Windows — e um atalho que a pessoa aperta e
 * não funciona é pior do que não anunciar atalho nenhum.
 *
 * O listener continua aceitando as duas teclas (metaKey OU ctrlKey); isto aqui
 * só decide o que fica escrito na tela.
 */
const ehMac = /Mac|iPhone|iPad|iPod/i.test(
  // userAgentData é o caminho novo; navigator.platform ainda é o que responde
  // em todo lugar. Em SSR/teste, nenhum dos dois existe — cai no Ctrl.
  (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    '',
)

/** O que aparece escrito no chip do atalho: `⌘K` no Mac, `Ctrl K` no resto. */
export const TECLA_ATALHO = ehMac ? '⌘K' : 'Ctrl K'
