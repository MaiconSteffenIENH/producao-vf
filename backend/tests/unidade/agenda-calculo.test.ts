import { describe, expect, it } from 'vitest'
import {
  calcularAgenda,
  diaDoAtelie,
  inicioDaSemana,
  inicioDoDia,
} from '../../src/lib/agenda-calculo'

// UTC-3: quinta 27/07/2026 às 15h em São Paulo = 18h UTC
const QUINTA = new Date('2026-07-30T18:00:00Z')

describe('inicioDaSemana / inicioDoDia', () => {
  it('a semana começa na segunda, no fuso do ateliê', () => {
    expect(diaDoAtelie(inicioDaSemana(QUINTA))).toBe('2026-07-27')
  })

  it('funciona na virada do dia — 22h em São Paulo ainda é o mesmo dia', () => {
    // 2026-07-31T01:00Z = 30/07 às 22h em São Paulo
    expect(diaDoAtelie(inicioDoDia(new Date('2026-07-31T01:00:00Z')))).toBe('2026-07-30')
  })

  it('domingo pertence à semana que começou na segunda anterior', () => {
    const domingo = new Date('2026-08-02T18:00:00Z')
    expect(diaDoAtelie(inicioDaSemana(domingo))).toBe('2026-07-27')
  })
})

describe('calcularAgenda — saldo rolante', () => {
  const base = (extra: Partial<Parameters<typeof calcularAgenda>[0]> = {}) =>
    calcularAgenda({
      capacidadeDiaria: 40,
      feitoHoje: 0,
      feitoNaSemana: 0,
      comecoSemana: inicioDaSemana(QUINTA),
      comecoHoje: inicioDoDia(QUINTA),
      diasDeFolga: new Set<string>(),
      ...extra,
    })

  it('o que ficou para trás soma na meta de hoje', () => {
    // quinta: seg/ter/qua deviam render 120, rendeu 90 → 30 de dívida
    const r = base({ feitoNaSemana: 90, feitoHoje: 0 })
    expect(r.saldoAnterior).toBe(-30)
    expect(r.metaDeHoje).toBe(70)
  })

  it('o que passou da meta abate', () => {
    const r = base({ feitoNaSemana: 140, feitoHoje: 0 })
    expect(r.saldoAnterior).toBe(20)
    expect(r.metaDeHoje).toBe(20)
  })

  it('adiantado demais não vira meta negativa', () => {
    const r = base({ feitoNaSemana: 1000, feitoHoje: 0 })
    expect(r.metaDeHoje).toBe(0)
    expect(r.faltaHoje).toBe(0)
  })

  it('em dia é meta cheia', () => {
    const r = base({ feitoNaSemana: 120 })
    expect(r.saldoAnterior).toBe(0)
    expect(r.metaDeHoje).toBe(40)
  })
})

describe('calcularAgenda — folga', () => {
  const comFolga = (dias: string[], extra = {}) =>
    calcularAgenda({
      capacidadeDiaria: 40,
      feitoHoje: 0,
      feitoNaSemana: 0,
      comecoSemana: inicioDaSemana(QUINTA),
      comecoHoje: inicioDoDia(QUINTA),
      diasDeFolga: new Set(dias),
      ...extra,
    })

  it('faltar na quarta NÃO vira dívida na quinta — era o defeito', () => {
    const semFolga = comFolga([], { feitoNaSemana: 80 })
    const comQuartaDeFolga = comFolga(['2026-07-29'], { feitoNaSemana: 80 })
    // sem folga o sistema cobra 3 dias (120) e acusa 40 de dívida
    expect(semFolga.saldoAnterior).toBe(-40)
    expect(semFolga.metaDeHoje).toBe(80)
    // com a folga registrada, cobra 2 dias (80): está em dia
    expect(comQuartaDeFolga.saldoAnterior).toBe(0)
    expect(comQuartaDeFolga.metaDeHoje).toBe(40)
    expect(comQuartaDeFolga.diasCobrados).toBe(2)
  })

  it('folga hoje zera a meta do dia', () => {
    const r = comFolga(['2026-07-30'], { feitoNaSemana: 80 })
    expect(r.folgaHoje).toBe(true)
    expect(r.metaDeHoje).toBe(0)
    expect(r.faltaHoje).toBe(0)
    expect(r.explicacao).toContain('Folga hoje')
  })

  it('o esperado da semana desconta os dias de folga', () => {
    const cheia = comFolga([])
    const comDuas = comFolga(['2026-07-28', '2026-07-29'])
    expect(cheia.esperadoNaSemana).toBe(280) // 7 × 40
    expect(comDuas.esperadoNaSemana).toBe(200) // 5 × 40
  })

  it('a explicação conta que houve folga, para o número não parecer errado', () => {
    const r = comFolga(['2026-07-29'], { feitoNaSemana: 80 })
    expect(r.explicacao).toContain('folga')
  })

  it('semana inteira de folga não gera cobrança nenhuma', () => {
    const dias = [
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]
    const r = comFolga(dias)
    expect(r.saldoAnterior).toBe(0)
    expect(r.metaDeHoje).toBe(0)
    expect(r.esperadoNaSemana).toBe(0)
  })
})
