/**
 * Formatação é FONTE ÚNICA. Nunca reimplemente inline — o mesmo helper serve
 * pra exibir na lista, no card e no detalhe, e é ele que garante que R$ e data
 * aparecem iguais em todo o sistema.
 */

export const brl = (v: number | string | null | undefined): string => {
  if (v === null || v === undefined || v === '') return '—'
  const n = typeof v === 'string' ? Number(v) : v
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export const dataBr = (iso: string | Date | null | undefined): string => {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

/*
 * Plural de verdade. Antes era `singular + 's'`, e por isso o app tinha
 * "1 peça(s) sem custo" e "3 item(ns)" espalhados: quem escrevia a frase sabia
 * que o helper ia errar e fugia dele. Agora a regra do português está aqui, e
 * "(s)" não precisa mais existir em lugar nenhum.
 */
const PLURAIS_IRREGULARES: Record<string, string> = {
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
  const irregular = PLURAIS_IRREGULARES[singular.toLowerCase()]
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
    if (final === 'el') return `${singular.slice(0, -2)}éis`
    if (final === 'ol') return `${singular.slice(0, -2)}óis`
    if (final === 'il') return `${singular.slice(0, -2)}is`
    return `${singular.slice(0, -1)}is` // -al, -ul
  }
  return `${singular}s`
}
/** Número + palavra: `plural(3, 'peça')` → `3 peças`. */
export const plural = (n: number, singular: string, pluralForma?: string): string =>
  `${n} ${formaPlural(n, singular, pluralForma)}`

/** Mesma normalização do backend — usada só pra filtrar listas já carregadas. */
export const normalizarBusca = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

/**
 * Preto ou branco por cima de um hex, escolhido pela luminância relativa.
 * Usado nos chips de esmalte: Búzios (#2C4162) precisa de texto claro,
 * Branco (#D9D7DA) precisa de texto escuro.
 */
export const contrasteDe = (hex: string): string => {
  const limpo = hex.replace('#', '')
  if (limpo.length !== 6) return '#000000'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(limpo.slice(i, i + 2), 16) / 255)
  const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const l = 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
  return l > 0.45 ? '#1b1917' : '#ffffff'
}
