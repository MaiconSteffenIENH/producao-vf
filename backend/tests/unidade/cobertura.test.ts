import { describe, expect, it } from 'vitest'
import {
  calcularCobertura,
  competenciaDe,
  minimoSugerido,
  velocidadeSemanal,
} from '../../src/lib/cobertura'

const v = (competencia: string, quantidade: number) => ({ competencia, quantidade })

describe('velocidadeSemanal', () => {
  it('ignora o mês corrente — no dia 3 ele tem 3 dias de venda e 27 de nada', () => {
    const comMesCorrente = velocidadeSemanal(
      [v('2026-05', 30), v('2026-06', 30), v('2026-07', 2)],
      '2026-07',
    )
    const semEle = velocidadeSemanal([v('2026-05', 30), v('2026-06', 30)], '2026-07')
    expect(comMesCorrente.porSemana).toBeCloseTo(semEle.porSemana, 6)
    expect(comMesCorrente.mesesConsiderados).toBe(2)
  })

  it('média dos últimos meses fechados', () => {
    // 30/mês ÷ 30,44 dias × 7 = ~6,9/semana
    const r = velocidadeSemanal([v('2026-05', 30), v('2026-06', 30)], '2026-07')
    expect(r.porSemana).toBeCloseTo((60 / (2 * 30.44)) * 7, 6)
    expect(r.total).toBe(60)
  })

  it('olha só os N meses mais recentes', () => {
    const r = velocidadeSemanal(
      [v('2026-01', 900), v('2026-04', 10), v('2026-05', 10), v('2026-06', 10)],
      '2026-07',
      3,
    )
    expect(r.mesesConsiderados).toBe(3)
    expect(r.total).toBe(30) // o pico de janeiro ficou de fora
  })

  it('sem histórico devolve zero, não NaN', () => {
    const r = velocidadeSemanal([], '2026-07')
    expect(r.porSemana).toBe(0)
    expect(Number.isNaN(r.porSemana)).toBe(false)
  })
})

describe('calcularCobertura', () => {
  it('o alarme de ruptura', () => {
    // 8 prontas, sai ~3/semana → 2,6 semanas; repor leva 4 → vai faltar
    const c = calcularCobertura(8, [v('2026-05', 13), v('2026-06', 13)], '2026-07', 4)
    expect(c.semanas).not.toBeNull()
    expect(c.semanas!).toBeLessThan(4)
    expect(c.vaiFaltar).toBe(true)
    expect(c.explicacao).toContain('Vai faltar')
  })

  it('o que está a caminho evita a ruptura', () => {
    const semReposicao = calcularCobertura(8, [v('2026-05', 13), v('2026-06', 13)], '2026-07', 4)
    const comReposicao = calcularCobertura(
      8,
      [v('2026-05', 13), v('2026-06', 13)],
      '2026-07',
      4,
      40,
    )
    expect(semReposicao.vaiFaltar).toBe(true)
    expect(comReposicao.vaiFaltar).toBe(false)
  })

  it('estoque folgado não alarma', () => {
    const c = calcularCobertura(200, [v('2026-05', 4), v('2026-06', 4)], '2026-07', 4)
    expect(c.vaiFaltar).toBe(false)
    expect(c.semanas!).toBeGreaterThan(4)
  })

  it('sem venda registrada não inventa cobertura', () => {
    const c = calcularCobertura(8, [], '2026-07', 4)
    expect(c.semanas).toBeNull()
    expect(c.vaiFaltar).toBe(false)
    expect(c.explicacao).toContain('Sem venda registrada')
  })

  it('peça que parou de vender não vira ruptura', () => {
    // zero venda em meses fechados: não há o que repor às pressas
    const c = calcularCobertura(0, [v('2026-05', 0), v('2026-06', 0)], '2026-07', 4)
    expect(c.vaiFaltar).toBe(false)
  })
})

describe('minimoSugerido', () => {
  it('cobre o tempo de reposição mais folga', () => {
    // ~3/semana, repor em 4 semanas, folga de 2 → 3 × 6 = 18
    const m = minimoSugerido([v('2026-05', 13), v('2026-06', 13)], '2026-07', 4, 2)
    expect(m).toBe(18)
  })

  it('sem venda não sugere mínimo — chutar seria repetir o problema', () => {
    expect(minimoSugerido([], '2026-07', 4)).toBeNull()
  })
})

describe('competenciaDe', () => {
  it('formata AAAA-MM com mês de dois dígitos', () => {
    expect(competenciaDe(new Date('2026-07-27T12:00:00Z'))).toBe('2026-07')
    expect(competenciaDe(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01')
  })
})
