import { describe, expect, it } from 'vitest'
import {
  agruparVendas,
  competenciaBr,
  lerCsvDeVendas,
  numeroBr,
} from '../../src/lib/csv-vendas'

describe('numeroBr', () => {
  it('lê número no formato brasileiro', () => {
    // Number('1.234,56') dá NaN; Number('1.234') daria 1,234 — erro de mil vezes
    expect(numeroBr('1.234,56')).toBeCloseTo(1234.56, 2)
    expect(numeroBr('12,5')).toBeCloseTo(12.5, 2)
    expect(numeroBr('40')).toBe(40)
  })

  it('aguenta R$ e espaço', () => {
    expect(numeroBr('R$ 1.899,90')).toBeCloseTo(1899.9, 2)
  })

  it('devolve null no lixo', () => {
    expect(numeroBr('')).toBeNull()
    expect(numeroBr('abc')).toBeNull()
  })
})

describe('competenciaBr', () => {
  it('entende os formatos que os marketplaces exportam', () => {
    expect(competenciaBr('2026-07')).toBe('2026-07')
    expect(competenciaBr('7/2026')).toBe('2026-07')
    expect(competenciaBr('07/2026')).toBe('2026-07')
    expect(competenciaBr('15/07/2026')).toBe('2026-07')
    expect(competenciaBr('jul/2026')).toBe('2026-07')
  })

  it('não inventa mês', () => {
    expect(competenciaBr('sem data')).toBeNull()
    expect(competenciaBr('')).toBeNull()
  })
})

describe('lerCsvDeVendas', () => {
  it('lê o CSV com ponto e vírgula — que é o que o Excel em português salva', () => {
    const csv = [
      'Produto;Cor;Mês;Quantidade;Valor total',
      'Bowl;Pistache;07/2026;12;R$ 1.188,00',
      'Xícara Andorinha;Coral;07/2026;5;R$ 445,50',
    ].join('\n')
    const r = lerCsvDeVendas(csv)
    expect(r.erros).toEqual([])
    expect(r.linhas).toHaveLength(2)
    expect(r.linhas[0]).toMatchObject({
      peca: 'Bowl',
      cor: 'Pistache',
      competencia: '2026-07',
      quantidade: 12,
    })
    expect(r.linhas[0].valorTotal).toBeCloseTo(1188, 2)
  })

  it('lê CSV com vírgula também', () => {
    const csv = 'produto,quantidade,data\nBowl,3,2026-06'
    const r = lerCsvDeVendas(csv)
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0].quantidade).toBe(3)
  })

  it('nome com vírgula dentro de aspas não quebra a linha', () => {
    const csv = 'produto,quantidade,data\n"Bowl, borda recortada",3,2026-06'
    const r = lerCsvDeVendas(csv)
    expect(r.linhas[0].peca).toBe('Bowl, borda recortada')
  })

  it('cabeçalho com acento e caixa diferente funciona', () => {
    const csv = 'PEÇA;QTD;MÊS\nBowl;4;06/2026'
    const r = lerCsvDeVendas(csv)
    expect(r.linhas).toHaveLength(1)
  })

  it('engole o BOM do Excel', () => {
    const csv = '﻿produto;quantidade;mes\nBowl;4;06/2026'
    const r = lerCsvDeVendas(csv)
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0].peca).toBe('Bowl')
  })

  it('linha ruim não derruba a importação inteira', () => {
    const csv = [
      'produto;quantidade;mes',
      'Bowl;12;07/2026',
      ';5;07/2026',
      'Bule;abc;07/2026',
      'Tortinha;7;07/2026',
    ].join('\n')
    const r = lerCsvDeVendas(csv)
    expect(r.linhas).toHaveLength(2)
    expect(r.erros).toHaveLength(2)
    expect(r.erros[0].linha).toBe(3)
  })

  it('sem coluna de peça ou quantidade, explica o que falta', () => {
    const r = lerCsvDeVendas('a;b;c\n1;2;3')
    expect(r.linhas).toHaveLength(0)
    expect(r.erros[0].motivo).toContain('peça')
  })

  it('planilha vazia não quebra', () => {
    expect(lerCsvDeVendas('')).toEqual({ linhas: [], erros: [], colunas: [] })
  })
})

describe('agruparVendas', () => {
  it('soma as linhas do mesmo mês — a planilha vem por PEDIDO', () => {
    // sem isto, a última linha sobrescreveria e o mês inteiro viraria um pedido
    const csv = [
      'produto;cor;quantidade;data',
      'Bowl;Pistache;2;15/07/2026',
      'Bowl;Pistache;3;18/07/2026',
      'Bowl;Coral;1;20/07/2026',
    ].join('\n')
    const agrupado = agruparVendas(lerCsvDeVendas(csv).linhas)
    expect(agrupado).toHaveLength(2)
    const pistache = agrupado.find((l) => l.cor === 'Pistache')!
    expect(pistache.quantidade).toBe(5)
  })

  it('soma o valor junto com a quantidade', () => {
    const csv = [
      'produto;quantidade;data;valor',
      'Bowl;2;15/07/2026;R$ 100,00',
      'Bowl;3;18/07/2026;R$ 150,00',
    ].join('\n')
    const [linha] = agruparVendas(lerCsvDeVendas(csv).linhas)
    expect(linha.quantidade).toBe(5)
    expect(linha.valorTotal).toBeCloseTo(250, 2)
  })

  it('mês diferente continua separado', () => {
    const csv = [
      'produto;quantidade;data',
      'Bowl;2;15/06/2026',
      'Bowl;3;18/07/2026',
    ].join('\n')
    expect(agruparVendas(lerCsvDeVendas(csv).linhas)).toHaveLength(2)
  })
})
