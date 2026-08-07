/*
 * BUSCA DENTRO DE UMA LISTA DE ESCOLHA — a parte que é conta, e por isso mora
 * aqui, fora do componente, e tem teste.
 *
 * O ateliê tem 16 peças, 12 esmaltes e as duas listas só crescem. Numa lista
 * suspensa comum, achar vira rolar — e rolar com a peça na mão, em pé, é onde a
 * pessoa desiste e escolhe a errada.
 *
 * ── A NORMALIZAÇÃO É A MESMA DO BACKEND ──
 *
 * `normalizarBusca` existe em backend/src/lib/busca.ts desde sempre, e é ela que
 * preenche a coluna `nome_busca`. Se a tela normalizasse de outro jeito, uma
 * busca acharia e a outra não, sobre o mesmo dado — o tipo de divergência que
 * ninguém liga a "duas funções parecidas em arquivos diferentes".
 *
 * ── POR QUE PONTUAR, E NÃO SÓ FILTRAR ──
 *
 * Filtrar por "contém" põe BOWL e BOWL RECORTADO em ordem alfabética, e quem
 * digitou "bowl r" queria o segundo. A ordem da lista é metade da utilidade da
 * busca: com a resposta certa em primeiro, `Enter` basta e a pessoa nunca tira a
 * mão do teclado.
 */

/** Igual à do backend: sem acento, minúsculo, sem sobra nas pontas. */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export type Buscavel = {
  /** o texto principal — nome da peça, do esmalte, da pessoa */
  rotulo: string
  /**
   * O que mais encontra este item: categoria, código do lote, tipo.
   *
   * Existe porque "café" precisa achar o BULE, que não tem "café" no nome mas é
   * da categoria Café. É como a pessoa pensa a lista, e a lista tem de aceitar.
   */
  extra?: string | null
}

/*
 * Os pesos, e o que cada um resolve.
 *
 * COMEÇA COM ganha de tudo: quem digita "bowl r" está soletrando o começo.
 * COMEÇO DE PALAVRA vem logo atrás, porque "refeicao" tem de achar
 * "PRATO DE REFEIÇÃO" sem a pessoa digitar "prato" primeiro.
 * NO MEIO ainda vale — "zinho" acha CAFEZINHO —, mas perde para os dois de cima.
 * NO EXTRA vale menos que qualquer acerto no nome: a categoria é um caminho
 * secundário, e deixá-la empatar com o nome faria a lista abrir errada.
 */
const PESO_COMECA = 100
const PESO_PALAVRA = 60
const PESO_MEIO = 30
const PESO_EXTRA = 15

/** Quanto este item combina com os termos. Negativo = não combina. */
export function pontuar(item: Buscavel, termos: readonly string[]): number {
  if (termos.length === 0) return 0

  const nome = normalizarBusca(item.rotulo)
  const palavras = nome.split(/\s+/)
  const extra = item.extra ? normalizarBusca(item.extra) : ''
  let pontos = 0

  for (const termo of termos) {
    if (nome.startsWith(termo)) pontos += PESO_COMECA
    else if (palavras.some((p) => p.startsWith(termo))) pontos += PESO_PALAVRA
    else if (nome.includes(termo)) pontos += PESO_MEIO
    else if (extra.includes(termo)) pontos += PESO_EXTRA
    /*
     * TODO termo precisa achar alguma coisa.
     *
     * "prato refeicao" tem de devolver uma peça, e não todos os pratos mais
     * tudo que tem "refeicao". Exigir os dois é o que faz digitar mais palavras
     * ESTREITAR a lista — que é a única razão de alguém digitar a segunda.
     */
    else return -1
  }
  return pontos
}

/** Quebra o que a pessoa digitou nos termos da busca. */
export const termosDe = (texto: string): string[] =>
  normalizarBusca(texto).split(/\s+/).filter(Boolean)

/**
 * A lista já filtrada e na ordem certa.
 *
 * Texto vazio devolve tudo, na ordem que veio: clicar no campo tem de mostrar a
 * lista inteira, como a lista suspensa de sempre. A busca é atalho, não pedágio
 * — quem não lembra o nome não pode ficar sem opção.
 */
export function filtrarPorBusca<T extends Buscavel>(itens: readonly T[], texto: string): T[] {
  const termos = termosDe(texto)
  if (termos.length === 0) return [...itens]

  return itens
    .map((item) => ({ item, pontos: pontuar(item, termos) }))
    .filter((x) => x.pontos >= 0)
    .sort((a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos
      // desempate estável: sem ele, a mesma busca abriria em ordens diferentes
      return a.item.rotulo.localeCompare(b.item.rotulo, 'pt-BR')
    })
    .map((x) => x.item)
}

/**
 * Onde grifar, para a pessoa ver POR QUE aquele item apareceu.
 *
 * Devolve pedaços em vez de HTML: montar marcação aqui obrigaria a tela a
 * confiar numa string, e nome de peça é digitado por gente.
 */
export function grifar(rotulo: string, texto: string): { texto: string; forte: boolean }[] {
  const termos = termosDe(texto)
  if (termos.length === 0) return [{ texto: rotulo, forte: false }]

  const pedacos: { texto: string; forte: boolean }[] = []
  for (const palavra of rotulo.split(' ')) {
    const normal = normalizarBusca(palavra)
    const termo = termos.find((t) => normal.startsWith(t))
    if (termo) {
      pedacos.push({ texto: palavra.slice(0, termo.length), forte: true })
      if (palavra.length > termo.length) {
        pedacos.push({ texto: palavra.slice(termo.length), forte: false })
      }
    } else {
      pedacos.push({ texto: palavra, forte: false })
    }
    pedacos.push({ texto: ' ', forte: false })
  }
  pedacos.pop(); // o espaço sobrando do último
  return pedacos
}
