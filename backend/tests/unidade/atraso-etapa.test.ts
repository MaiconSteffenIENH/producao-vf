import { describe, expect, it } from 'vitest'
import { fraseDaPermanencia, permanenciaNaEtapa, ultimaEntrada } from '../../src/lib/atraso-etapa'

// 17/09/2026 (quinta) às 08:30 em Novo Hamburgo = 11:30 UTC
const agora = new Date('2026-09-17T11:30:00Z')

describe('permanenciaNaEtapa', () => {
  it('conta dias de ateliê, não horas: entrou terça às 17h, olhado quarta às 8h, é 1 dia', () => {
    const p = permanenciaNaEtapa(new Date('2026-09-15T20:00:00Z'), new Date('2026-09-16T11:00:00Z'), 5)
    expect(p.diasNaEtapa).toBe(1)
    expect(p.situacao).toBe('no_prazo')
  })

  it('entrou às 22h de ontem no ateliê (01h UTC de hoje): ainda é ontem, 1 dia', () => {
    const p = permanenciaNaEtapa(new Date('2026-09-17T01:00:00Z'), agora, 5)
    expect(p.diasNaEtapa).toBe(1)
  })

  it('no 5º dia de uma etapa de 5 vence hoje; no 6º atrasou 1', () => {
    expect(permanenciaNaEtapa(new Date('2026-09-12T12:00:00Z'), agora, 5)).toMatchObject({
      diasNaEtapa: 5,
      atrasoDias: 0,
      situacao: 'vence_hoje',
    })
    expect(permanenciaNaEtapa(new Date('2026-09-11T12:00:00Z'), agora, 5)).toMatchObject({
      diasNaEtapa: 6,
      atrasoDias: 1,
      situacao: 'atrasado',
    })
  })

  it('entrou hoje é dia zero, mesmo que a hora ainda vá mudar', () => {
    const p = permanenciaNaEtapa(new Date('2026-09-17T10:00:00Z'), agora, 2)
    expect(p.diasNaEtapa).toBe(0)
    expect(p.situacao).toBe('no_prazo')
  })

  it('previsto negativo ou entrada no futuro não viram número negativo', () => {
    expect(permanenciaNaEtapa(new Date('2026-09-20T10:00:00Z'), agora, -3)).toMatchObject({
      diasNaEtapa: 0,
      diasEstimados: 0,
    })
  })
})

describe('ultimaEntrada', () => {
  it('lote que voltou para a etapa recomeça a contar do retorno', () => {
    const movimentos = [
      { etapaDestinoId: 'esmaltacao', criadoEm: new Date('2026-09-01T12:00:00Z') },
      { etapaDestinoId: 'queima2', criadoEm: new Date('2026-09-03T12:00:00Z') },
      { etapaDestinoId: 'esmaltacao', criadoEm: new Date('2026-09-10T12:00:00Z') },
      { etapaDestinoId: null, criadoEm: new Date('2026-09-11T12:00:00Z') },
    ]
    expect(ultimaEntrada(movimentos, 'esmaltacao')?.toISOString()).toBe('2026-09-10T12:00:00.000Z')
    expect(ultimaEntrada(movimentos, 'secagem')).toBeNull()
  })
})

describe('fraseDaPermanencia', () => {
  it('fala como a equipe fala', () => {
    expect(fraseDaPermanencia(permanenciaNaEtapa(new Date('2026-09-11T12:00:00Z'), agora, 5))).toBe(
      '1 dia além do previsto (5)',
    )
    expect(fraseDaPermanencia(permanenciaNaEtapa(new Date('2026-09-12T12:00:00Z'), agora, 5))).toBe(
      'vence hoje (previsto 5)',
    )
    expect(fraseDaPermanencia(permanenciaNaEtapa(new Date('2026-09-14T12:00:00Z'), agora, 5))).toBe(
      '3 dias aqui, previsto 5',
    )
    expect(fraseDaPermanencia(permanenciaNaEtapa(new Date('2026-09-17T10:00:00Z'), agora, 1))).toBe(
      'entrou hoje, previsto 1 dia',
    )
  })
})
