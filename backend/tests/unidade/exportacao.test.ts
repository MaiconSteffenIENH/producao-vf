import { describe, expect, it } from 'vitest'
import { celulaCsv, instanteBr, paraCsv } from '../../src/lib/exportacao'

describe('exportação em CSV', () => {
  it('abre no Excel pt-BR: BOM, ponto e vírgula e vírgula decimal', () => {
    const csv = paraCsv([{ chave: 'a', rotulo: 'Peça' }, { chave: 'b', rotulo: 'Qtd' }], [{ a: 'XÍCARA', b: 2.5 }])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('Peça;Qtd\r\nXÍCARA;2,5\r\n')
  })
  it('aspas, ponto e vírgula e quebra de linha ficam dentro da célula', () => {
    expect(celulaCsv('trincou; "feio"')).toBe('"trincou; ""feio"""')
    expect(celulaCsv('a\nb')).toBe('"a\nb"')
  })
  it('texto que parece fórmula não vira fórmula', () => {
    expect(celulaCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(celulaCsv('-3 peças')).toBe("'-3 peças")
  })
  it('vazio é vazio, e o instante sai no fuso do ateliê', () => {
    expect(celulaCsv(null)).toBe('')
    expect(instanteBr(new Date('2026-10-29T01:30:00Z'))).toBe('28/10/2026 22:30')
  })
})
