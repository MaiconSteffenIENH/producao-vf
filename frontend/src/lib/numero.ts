/*
 * O QUE UM CAMPO DE NÚMERO PRECISA ENTENDER — a parte que é conta, e por isso
 * mora fora do componente e tem teste.
 *
 * O defeito que motivou isto tinha três caras, todas do mesmo lugar: o estado
 * guardava NÚMERO e o campo devolvia TEXTO. `Number('')` é zero, então apagar
 * tudo deixava "0" preso no campo; com o zero preso, digitar 123 escrevia ao
 * lado ("0123"); e clicar num campo que valia 20 para escrever 25 produzia
 * 2025.
 *
 * A regra aqui é simples de propósito: texto entra, número ou NULO sai. Nulo é
 * "não tem número", que é diferente de zero — e essa diferença é o conserto.
 */

/** O que a pessoa digitou, virado número. Vazio vira nulo, e não zero. */
export function interpretarNumero(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.')
  if (limpo === '') return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/** O caminho de volta: número para o texto do campo. Nulo vira campo vazio. */
export function textoDoNumero(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '' : String(valor)
}

/**
 * A pessoa pode digitar isto?
 *
 * O sinal de menos não entra em nenhum campo do sistema: quantidade, dias,
 * percentual e preço negativos nunca são intenção, são erro de digitação. Barrar
 * na tecla é melhor do que corrigir depois — corrigir depois é o cursor pulando.
 *
 * Aceita o texto PARCIAL, e é isso que permite digitar: "1," precisa passar
 * para "1,5" existir.
 */
export function podeDigitar(texto: string, decimais = 0): boolean {
  return decimais > 0 ? /^\d*(?:[.,]\d*)?$/.test(texto) : /^\d*$/.test(texto)
}
