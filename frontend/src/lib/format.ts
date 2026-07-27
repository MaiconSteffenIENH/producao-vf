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

export const plural = (n: number, singular: string, pluralForma?: string): string =>
  `${n} ${n === 1 ? singular : (pluralForma ?? `${singular}s`)}`

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
