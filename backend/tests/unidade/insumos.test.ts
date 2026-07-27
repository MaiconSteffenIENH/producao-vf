import { describe, expect, it } from 'vitest'
import {
  necessidadeDeInsumos,
  type ConsumoDeInsumo,
  type EstoqueDeInsumo,
} from '../../src/lib/insumos'

const estoque = (
  materiaPrimaId: string,
  nome: string,
  estoqueAtual: number,
  extra: Partial<EstoqueDeInsumo> = {},
): EstoqueDeInsumo => ({
  materiaPrimaId,
  nome,
  unidade: 'kg',
  estoqueAtual,
  estoqueMinimo: 0,
  prazoEntregaDias: 7,
  ...extra,
})

const consumo = (
  materiaPrimaId: string,
  quantidadePorPeca: number,
  corId: string | null = null,
): ConsumoDeInsumo => ({ materiaPrimaId, quantidadePorPeca, corId })

describe('necessidadeDeInsumos', () => {
  const estoques = new Map([
    ['argila', estoque('argila', 'Argila de grês', 40)],
    ['pistache', estoque('pistache', 'Esmalte Pistache', 1.2)],
    ['coral', estoque('coral', 'Esmalte Coral', 9)],
  ])

  it('a frase que resolve: "o plano pede 14 kg e há 1,2"', () => {
    const consumos = new Map([['bowl', [consumo('pistache', 0.07, 'cor-pistache')]]])
    const r = necessidadeDeInsumos(
      [{ pecaId: 'bowl', corId: 'cor-pistache', quantidade: 200 }],
      consumos,
      estoques,
    )
    const pistache = r.find((i) => i.materiaPrimaId === 'pistache')!
    expect(pistache.necessario).toBeCloseTo(14, 3)
    expect(pistache.estoqueAtual).toBe(1.2)
    expect(pistache.comprar).toBeCloseTo(12.8, 3)
  })

  it('insumo amarrado a uma cor não conta em lote de outra cor', () => {
    const consumos = new Map([
      ['bowl', [consumo('pistache', 0.07, 'cor-pistache'), consumo('coral', 0.07, 'cor-coral')]],
    ])
    const r = necessidadeDeInsumos(
      [{ pecaId: 'bowl', corId: 'cor-coral', quantidade: 100 }],
      consumos,
      estoques,
    )
    expect(r.find((i) => i.materiaPrimaId === 'pistache')).toBeUndefined()
    expect(r.find((i) => i.materiaPrimaId === 'coral')!.necessario).toBeCloseTo(7, 3)
  })

  it('insumo sem cor vale para qualquer lote — a argila é a mesma', () => {
    const consumos = new Map([['bowl', [consumo('argila', 0.5)]]])
    const r = necessidadeDeInsumos(
      [
        { pecaId: 'bowl', corId: 'cor-pistache', quantidade: 10 },
        { pecaId: 'bowl', corId: null, quantidade: 10 },
      ],
      consumos,
      estoques,
    )
    expect(r.find((i) => i.materiaPrimaId === 'argila')!.necessario).toBeCloseTo(10, 3)
  })

  it('soma o consumo de várias peças no mesmo insumo', () => {
    const consumos = new Map([
      ['bowl', [consumo('argila', 0.5)]],
      ['bule', [consumo('argila', 1.2)]],
    ])
    const r = necessidadeDeInsumos(
      [
        { pecaId: 'bowl', corId: null, quantidade: 20 },
        { pecaId: 'bule', corId: null, quantidade: 10 },
      ],
      consumos,
      estoques,
    )
    expect(r[0].necessario).toBeCloseTo(22, 3)
  })

  it('estoque suficiente não manda comprar', () => {
    const consumos = new Map([['bowl', [consumo('argila', 0.1)]]])
    const r = necessidadeDeInsumos(
      [{ pecaId: 'bowl', corId: null, quantidade: 50 }],
      consumos,
      estoques,
    )
    expect(r[0].comprar).toBe(0)
  })

  it('a compra respeita o mínimo em casa, não só o plano', () => {
    const comMinimo = new Map([['coral', estoque('coral', 'Esmalte Coral', 9, { estoqueMinimo: 5 })]])
    const consumos = new Map([['bowl', [consumo('coral', 0.1)]]])
    const r = necessidadeDeInsumos(
      [{ pecaId: 'bowl', corId: null, quantidade: 100 }],
      consumos,
      comMinimo,
    )
    // precisa 10, tem 9, quer manter 5 de reserva → comprar 6
    expect(r[0].comprar).toBeCloseTo(6, 3)
  })

  it('prazo de entrega maior que o uso marca urgente', () => {
    const lento = new Map([['pistache', estoque('pistache', 'Esmalte Pistache', 0, { prazoEntregaDias: 21 })]])
    const consumos = new Map([['bowl', [consumo('pistache', 0.07)]]])
    const r = necessidadeDeInsumos(
      [{ pecaId: 'bowl', corId: null, quantidade: 100 }],
      consumos,
      lento,
      14,
    )
    expect(r[0].urgente).toBe(true)
  })

  it('urgente aparece antes de quem só precisa de mais', () => {
    const mix = new Map([
      ['argila', estoque('argila', 'Argila de grês', 0, { prazoEntregaDias: 2 })],
      ['pistache', estoque('pistache', 'Esmalte Pistache', 0, { prazoEntregaDias: 30 })],
    ])
    const consumos = new Map([['bowl', [consumo('argila', 5), consumo('pistache', 0.05)]]])
    const r = necessidadeDeInsumos(
      [{ pecaId: 'bowl', corId: null, quantidade: 100 }],
      consumos,
      mix,
      14,
    )
    expect(r[0].materiaPrimaId).toBe('pistache') // menos quantidade, mas não chega a tempo
    expect(r[0].urgente).toBe(true)
  })

  it('peça sem insumo cadastrado não gera linha nem quebra', () => {
    const r = necessidadeDeInsumos(
      [{ pecaId: 'desconhecida', corId: null, quantidade: 100 }],
      new Map(),
      estoques,
    )
    expect(r).toEqual([])
  })

  it('insumo cadastrado que não existe mais no estoque é ignorado', () => {
    const consumos = new Map([['bowl', [consumo('apagado', 1)]]])
    const r = necessidadeDeInsumos(
      [{ pecaId: 'bowl', corId: null, quantidade: 10 }],
      consumos,
      estoques,
    )
    expect(r).toEqual([])
  })
})
