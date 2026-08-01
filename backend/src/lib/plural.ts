/*
 * As frases do planejamento saem daqui do backend e a Vera lê exatamente o que
 * este arquivo escreve — "Mínimo desejado 50. Hoje: 1 prontas" é o tipo de
 * detalhe que faz um sistema parecer improvisado. Regra do português numa
 * função, com as poucas irregulares que o app usa.
 *
 * Gêmeo de frontend/src/lib/format.ts. São dois arquivos porque não há pacote
 * compartilhado entre os dois lados; se um dia houver, este é o primeiro
 * candidato a mudar de casa.
 */

const IRREGULARES: Record<string, string> = {
  item: 'itens',
  'matéria-prima': 'matérias-primas',
  responsável: 'responsáveis',
  canal: 'canais',
}

const VOGAIS = 'aeiouáéíóúâêôãõà'

/** Só a palavra no número certo: `formaPlural(3, 'item')` → `itens`. */
export function formaPlural(n: number, singular: string, pluralForma?: string): string {
  if (Math.abs(n) === 1) return singular
  if (pluralForma) return pluralForma
  const irregular = IRREGULARES[singular.toLowerCase()]
  if (irregular) return irregular

  const baixo = singular.toLowerCase()
  const final = baixo.slice(-2)
  const penultima = baixo.at(-2) ?? ''

  if (baixo.endsWith('ão')) return `${singular.slice(0, -2)}ões`
  if (baixo.endsWith('m')) return `${singular.slice(0, -1)}ns`
  if (baixo.endsWith('r') || baixo.endsWith('z') || baixo.endsWith('s')) return `${singular}es`
  /*
   * O -l só cai quando vem VOGAL antes dele: canal→canais, papel→papéis. Em
   * "Bowl" a letra anterior é consoante, e a regra do português não se aplica
   * a estrangeirismo — a versão anterior devolvia "Bowis", que o teste pegou.
   * Bowl é o nome de metade do catálogo da Vera; não dava para deixar passar.
   */
  if (baixo.endsWith('l') && VOGAIS.includes(penultima)) {
    /*
     * O acento novo só entra em palavra OXÍTONA: papel→papéis, anzol→anzóis,
     * funil→funis. Quando a palavra JÁ tem acento antes (vendável, fácil,
     * possível), a sílaba forte é outra e o plural não ganha acento nenhum —
     * é vendáveis e fáceis, não "vendávéis" e "fácis".
     *
     * O sinal de que a palavra não é oxítona é ela já trazer vogal acentuada
     * no radical. Não é regra de gramática completa, é o que separa os dois
     * casos que aparecem aqui: nome de peça e adjetivo de tela.
     */
    const jaTemAcento = /[áéíóúâêôãõà]/.test(baixo.slice(0, -2))
    if (final === 'el') return `${singular.slice(0, -2)}${jaTemAcento ? 'eis' : 'éis'}`
    if (final === 'ol') return `${singular.slice(0, -2)}${jaTemAcento ? 'ois' : 'óis'}`
    if (final === 'il') return `${singular.slice(0, -2)}${jaTemAcento ? 'eis' : 'is'}`
    return `${singular.slice(0, -1)}is` // -al, -ul
  }
  return `${singular}s`
}

/** Número + palavra: `plural(3, 'peça')` → `3 peças`. */
export function plural(n: number, singular: string, pluralForma?: string): string {
  return `${n} ${formaPlural(n, singular, pluralForma)}`
}

/*
 * Nome de peça é outro caso. "Xícara Andorinha" não vira "Xícara Andorinhas" —
 * Andorinha é o nome do modelo, não um adjetivo. Quem flexiona é o substantivo
 * da frente, exatamente como a Gabi escreveu no briefing dela:
 *
 *   Produzir 50 Xícaras Andorinha
 *   Repor 18 Copinhos de Café
 *   Esmaltar 12 Pratos de Refeição
 *
 * Limite conhecido: em "Manteigueira Francesa" o certo seria flexionar os dois
 * ("Manteigueiras Francesas"), e aqui sai "Manteigueiras Francesa". Distinguir
 * modelo de adjetivo exigiria marcar isso no cadastro da peça; até lá, errar
 * pelo lado de não mexer no nome do modelo é o erro mais barato.
 */
export function pluralNome(n: number, nome: string): string {
  if (Math.abs(n) === 1) return `${n} ${nome}`
  const [cabeca, ...resto] = nome.split(' ')
  return `${n} ${[formaPlural(2, cabeca), ...resto].join(' ')}`
}
