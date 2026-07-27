import { describe, expect, it } from 'vitest'
import {
  DIAS_ATE_QUEIMAR_MEIA_CARGA,
  montarCarga,
  recomendarQueima,
  situacaoDaCarga,
  type LoteEsperando,
} from '../../src/lib/queima'

const lote = (codigo: string, quantidade: number, diasParado = 0): LoteEsperando => ({
  loteId: codigo,
  codigo,
  pecaNome: 'Bowl',
  quantidade,
  diasParado,
})

describe('situacaoDaCarga', () => {
  it('diz quantas faltam para fechar o forno', () => {
    const s = situacaoDaCarga([lote('L-1', 40), lote('L-2', 28)], 80)
    expect(s.esperando).toBe(68)
    expect(s.faltamParaFechar).toBe(12)
    expect(s.podeQueimar).toBe(false)
    expect(s.ocupacao).toBe(85)
  })

  it('carga cheia libera a queima', () => {
    const s = situacaoDaCarga([lote('L-1', 80)], 80)
    expect(s.podeQueimar).toBe(true)
    expect(s.faltamParaFechar).toBe(0)
    expect(s.ocupacao).toBe(100)
  })

  it('fila maior que o forno não vira ocupação acima de 100%', () => {
    const s = situacaoDaCarga([lote('L-1', 200)], 80)
    expect(s.ocupacao).toBe(100)
    expect(s.cabeAgora).toBe(80)
    expect(s.esperando).toBe(200)
  })

  it('fila vazia', () => {
    const s = situacaoDaCarga([], 80)
    expect(s.esperando).toBe(0)
    expect(s.podeQueimar).toBe(false)
    expect(s.faltamParaFechar).toBe(80)
  })

  it('capacidade zero não divide por zero', () => {
    const s = situacaoDaCarga([lote('L-1', 10)], 0)
    expect(Number.isFinite(s.ocupacao)).toBe(true)
  })
})

describe('recomendarQueima', () => {
  it('a sugestão que nenhum ateliê calcula de cabeça', () => {
    const r = recomendarQueima(situacaoDaCarga([lote('L-1', 40), lote('L-2', 28)], 80))
    expect(r.acao).toBe('completar')
    if (r.acao === 'completar') {
      expect(r.faltam).toBe(12)
      // as 12 desbloqueiam as 68 — é isso que a frase precisa dizer
      expect(r.motivo).toContain('12')
      expect(r.motivo).toContain('68')
    }
  })

  it('carga cheia manda queimar', () => {
    expect(recomendarQueima(situacaoDaCarga([lote('L-1', 90)], 80)).acao).toBe('queimar')
  })

  it('peça parada há uma semana queima mesmo com forno pela metade', () => {
    // segurar peça esperando o último lugar é o modo de falha oposto, e mais caro
    const s = situacaoDaCarga([lote('L-1', 20, DIAS_ATE_QUEIMAR_MEIA_CARGA)], 80)
    const r = recomendarQueima(s)
    expect(r.acao).toBe('queimar')
    expect(r.motivo).toContain('parada')
  })

  it('pouca peça e ninguém esperando há muito: completar', () => {
    const r = recomendarQueima(situacaoDaCarga([lote('L-1', 10, 1)], 80))
    expect(r.acao).toBe('completar')
    if (r.acao === 'completar') expect(r.faltam).toBe(70)
  })

  it('fila vazia não sugere nada', () => {
    expect(recomendarQueima(situacaoDaCarga([], 80)).acao).toBe('esperar')
  })
})

describe('montarCarga', () => {
  it('quem espera há mais tempo entra primeiro', () => {
    const carga = montarCarga(
      [lote('L-novo', 30, 1), lote('L-velho', 30, 9), lote('L-medio', 30, 5)],
      60,
    )
    expect(carga.map((c) => c.loteId)).toEqual(['L-velho', 'L-medio'])
  })

  it('lote entra parcialmente quando não cabe inteiro', () => {
    const carga = montarCarga([lote('L-1', 40, 3)], 25)
    expect(carga).toEqual([{ loteId: 'L-1', quantidade: 25 }])
  })

  it('nunca passa da capacidade', () => {
    const carga = montarCarga([lote('L-1', 50, 3), lote('L-2', 50, 2), lote('L-3', 50, 1)], 80)
    expect(carga.reduce((n, c) => n + c.quantidade, 0)).toBe(80)
  })

  it('empate de dias desempata por código, para o resultado ser estável', () => {
    const a = montarCarga([lote('L-002', 10, 4), lote('L-001', 10, 4)], 10)
    const b = montarCarga([lote('L-001', 10, 4), lote('L-002', 10, 4)], 10)
    expect(a).toEqual(b)
    expect(a[0].loteId).toBe('L-001')
  })

  it('capacidade zero não carrega nada', () => {
    expect(montarCarga([lote('L-1', 40, 3)], 0)).toEqual([])
  })
})
