/*
 * A ORDEM DA LISTA, DEFINIDA ARRASTANDO.
 *
 * Etapas e Categorias sempre tiveram um campo numérico de ordem, preenchido à
 * mão dentro do modal de edição. Para trocar duas etapas de lugar era preciso
 * abrir uma, mudar o número, salvar, abrir a outra, mudar o número — e ainda
 * lembrar de cabeça qual número cada uma tinha. Arrastar a linha diz a mesma
 * coisa em um gesto; o campo continua existindo como saída de emergência.
 *
 * ESTE ARQUIVO NÃO GRAVA NADA. Ele recebe a lista como está hoje e os ids na
 * ordem nova, e devolve os pares {id, ordem} a gravar. Puro de propósito: é o
 * que permite testar sem banco os casos que o navegador não faz de propósito,
 * mas que a rede e duas pessoas mexendo ao mesmo tempo fazem sozinhos.
 *
 * ── AS TRÊS DECISÕES QUE ESTÃO AQUI ──
 *
 * 1. A POSIÇÃO COMEÇA EM 1, e a numeração é recomprimida sem buracos. O seed
 *    grava as etapas de 10 em 10 (10, 15, 20, 30…) — espaço para encaixar uma
 *    etapa no meio, que era exatamente o trabalho que o arrasto elimina. Como
 *    a tela de Etapas MOSTRA esse número numa coluna chamada "Ordem", ele
 *    precisa bater com a posição que o olho vê: a terceira linha lê 3. Zero na
 *    primeira linha seria um número que só faz sentido para quem programa.
 *
 * 2. QUEM NÃO FOI CITADO VAI PARA O FIM, mantendo a ordem relativa que tinha.
 *    Acontece quando alguém cadastra uma categoria enquanto a outra pessoa
 *    arrasta: a lista que chega não conhece a novata. Ignorá-la deixaria duas
 *    linhas com a mesma ordem; recusar tudo perderia o arrasto inteiro por
 *    causa de um item que ninguém tocou. Ir para o fim é a única saída que
 *    mantém a lista íntegra e não inventa uma posição no meio.
 *
 * 3. ORDEM QUE NÃO MUDOU NÃO É GRAVADA. Soltar a linha no mesmo lugar é o
 *    desfecho mais comum de um arrasto hesitante — e num app que fica aberto
 *    em tela de toque o dia todo, acontece toda hora. Sem este filtro cada
 *    hesitação viraria um UPDATE por linha da tabela.
 */

export type ItemOrdenado = {
  id: string
  /** a ordem gravada hoje */
  ordem: number
}

export type ParaGravar = {
  id: string
  ordem: number
}

export type Reordenacao = {
  /** só as linhas cuja ordem realmente muda; vazio quando não há o que fazer */
  gravar: ParaGravar[]
  /** ids que vieram do cliente e não existem mais na lista */
  desconhecidos: string[]
  /** ids que existem na lista e o cliente não citou — vão para o fim */
  ausentes: string[]
}

/** A primeira linha da tela lê "1", não "0" — ver decisão 1 no topo. */
export const PRIMEIRA_POSICAO = 1

/**
 * Dada a lista de hoje e os ids na ordem nova, o que precisa ser gravado.
 *
 * Id repetido vale pela primeira aparição. Não é escolha de ninguém — é
 * requisição malformada — e recusar a operação inteira por causa dela seria
 * trocar um erro invisível por um erro visível sem ganhar nada.
 */
export function calcularNovaOrdem(atuais: ItemOrdenado[], idsNaOrdem: string[]): Reordenacao {
  const existentes = new Map(atuais.map((i) => [i.id, i.ordem]))

  const citados: string[] = []
  const jaCitado = new Set<string>()
  const desconhecidos: string[] = []
  for (const id of idsNaOrdem) {
    if (!existentes.has(id)) {
      if (!desconhecidos.includes(id)) desconhecidos.push(id)
      continue
    }
    if (jaCitado.has(id)) continue
    jaCitado.add(id)
    citados.push(id)
  }

  const ausentes = atuais.map((i) => i.id).filter((id) => !jaCitado.has(id))

  /*
   * Nenhum id conhecido: ou a lista chegou vazia, ou tudo o que veio já saiu
   * do sistema. Recomprimir a numeração aqui seria escrever em toda a tabela
   * por causa de uma requisição que não pediu nada.
   */
  if (citados.length === 0) return { gravar: [], desconhecidos, ausentes }

  const gravar: ParaGravar[] = []
  ;[...citados, ...ausentes].forEach((id, indice) => {
    const ordem = PRIMEIRA_POSICAO + indice
    if (existentes.get(id) !== ordem) gravar.push({ id, ordem })
  })

  return { gravar, desconhecidos, ausentes }
}
