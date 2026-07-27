/**
 * Normaliza texto para busca acento-insensível.
 * Fonte única — a coluna `nome_busca` é preenchida com isto no backend
 * e a busca compara sempre normalizado dos dois lados. Teclado sem acento
 * precisa achar "José" e "Xícara".
 */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
