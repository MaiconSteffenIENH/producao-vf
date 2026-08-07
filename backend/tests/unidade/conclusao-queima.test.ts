import { describe, expect, it } from 'vitest'
import {
  chaveDaConclusao,
  planejarConclusao,
  QuebraInvalida,
  type EstadoDoLote,
  type ItemDaCarga,
} from '../../src/lib/conclusao-queima'

const item = (loteId: string, quantidade: number, codigo = loteId, pecaNome = 'BULE'): ItemDaCarga => ({
  loteId,
  codigo,
  pecaNome,
  quantidade,
})

const estado = (saldo: number, proximaEtapaId: string | null = 'biscoito'): EstadoDoLote => ({
  saldo,
  etapaId: 'queima1',
  proximaEtapaId,
})

describe('planejarConclusao', () => {
  it('sem quebra, avança tudo que entrou na fornada', () => {
    const plano = planejarConclusao(
      [item('a', 30), item('b', 50)],
      new Map([
        ['a', estado(30)],
        ['b', estado(50)],
      ]),
      new Map(),
    )
    expect(plano.totalAvancado).toBe(80)
    expect(plano.totalPerdido).toBe(0)
    expect(plano.avisos).toEqual([])
    expect(plano.acoes.map((a) => [a.loteId, a.avancar, a.perder])).toEqual([
      ['a', 30, 0],
      ['b', 50, 0],
    ])
  })

  it('a quebra sai do que avança, não some do total', () => {
    const plano = planejarConclusao([item('a', 30)], new Map([['a', estado(30)]]), new Map([['a', 4]]))
    expect(plano.totalAvancado).toBe(26)
    expect(plano.totalPerdido).toBe(4)
    expect(plano.acoes[0]).toMatchObject({ avancar: 26, perder: 4, etapaOrigemId: 'queima1', etapaDestinoId: 'biscoito' })
  })

  it('quebrou a carga inteira: nada avança, mas a perda é gravada', () => {
    const plano = planejarConclusao([item('a', 12)], new Map([['a', estado(12)]]), new Map([['a', 12]]))
    expect(plano.totalAvancado).toBe(0)
    expect(plano.totalPerdido).toBe(12)
    expect(plano.acoes).toHaveLength(1)
  })

  /*
   * O caso que motivou a regra: o lote tem MAIS peças na etapa do que entraram
   * no forno. Avançar pelo saldo mandaria peça crua para o estoque.
   */
  it('avança pela CARGA quando sobrou peça na prateleira', () => {
    const plano = planejarConclusao([item('a', 80)], new Map([['a', estado(100)]]), new Map())
    expect(plano.totalAvancado).toBe(80)
    expect(plano.avisos).toEqual([])
  })

  it('avança pelo SALDO quando alguém já mexeu no lote pelo quadro', () => {
    const plano = planejarConclusao([item('a', 80, 'L-0031')], new Map([['a', estado(50)]]), new Map())
    expect(plano.totalAvancado).toBe(50)
    expect(plano.avisos).toHaveLength(1)
    expect(plano.avisos[0]).toContain('L-0031')
    expect(plano.avisos[0]).toContain('80')
    expect(plano.avisos[0]).toContain('50')
  })

  // saldo zero = alguém já moveu pelo quadro. É aviso, não bloqueio: as peças
  // estão onde deveriam, só não foi a fornada que as levou.
  it('lote que já saiu da etapa é pulado, com aviso, e não vira ação', () => {
    const plano = planejarConclusao(
      [item('a', 30, 'L-0031', 'PRATO DE PÃO'), item('b', 20, 'L-0032')],
      new Map([
        ['a', estado(0)],
        ['b', estado(20)],
      ]),
      new Map(),
    )
    expect(plano.acoes.map((a) => a.loteId)).toEqual(['b'])
    expect(plano.avisos[0]).toContain('L-0031')
    expect(plano.avisos[0]).toContain('PRATO DE PÃO')
  })

  it('saldo zero conta como já saiu', () => {
    const plano = planejarConclusao([item('a', 30)], new Map([['a', estado(0)]]), new Map())
    expect(plano.acoes).toEqual([])
    expect(plano.avisos).toHaveLength(1)
  })

  /*
   * Última parada do roteiro: não há destino. A quebra ainda precisa ser
   * gravada, senão a peça que estourou continuaria contando como estoque.
   */
  it('queima final: não avança, mas registra a quebra', () => {
    const plano = planejarConclusao(
      [item('a', 20)],
      new Map([['a', estado(20, null)]]),
      new Map([['a', 3]]),
    )
    expect(plano.totalAvancado).toBe(0)
    expect(plano.totalPerdido).toBe(3)
    expect(plano.acoes[0].etapaDestinoId).toBeNull()
    expect(plano.avisos.join(' ')).toContain('última parada')
  })

  it('lote sem quebra e sem destino não vira ação nenhuma', () => {
    const plano = planejarConclusao([item('a', 20)], new Map([['a', estado(20, null)]]), new Map())
    expect(plano.acoes).toEqual([])
  })

  it('não deixa quebrar mais do que entrou no forno', () => {
    expect(() => planejarConclusao([item('a', 10, 'L-0031')], new Map([['a', estado(40)]]), new Map([['a', 11]])))
      .toThrow(QuebraInvalida)
  })

  it('não deixa quebrar mais do que ainda está na etapa', () => {
    expect(() => planejarConclusao([item('a', 80, 'L-0031')], new Map([['a', estado(5)]]), new Map([['a', 10]])))
      .toThrow(/só tem 5/i)
  })

  it('quebra em lote que já saiu da etapa é recusada, não ignorada', () => {
    expect(() =>
      planejarConclusao([item('a', 30, 'L-0031')], new Map([['a', estado(0)]]), new Map([['a', 2]])),
    ).toThrow(/quadro/i)
  })

  it('quebra de lote que não está na fornada é recusada', () => {
    expect(() => planejarConclusao([item('a', 30)], new Map([['a', estado(30)]]), new Map([['z', 1]])))
      .toThrow(QuebraInvalida)
  })

  it('quebra negativa ou quebrada é recusada', () => {
    expect(() => planejarConclusao([item('a', 30)], new Map([['a', estado(30)]]), new Map([['a', -1]])))
      .toThrow(QuebraInvalida)
    expect(() => planejarConclusao([item('a', 30)], new Map([['a', estado(30)]]), new Map([['a', 2.5]])))
      .toThrow(QuebraInvalida)
  })

  it('carga vazia devolve plano vazio, sem estourar', () => {
    const plano = planejarConclusao([], new Map(), new Map())
    expect(plano).toMatchObject({ acoes: [], avisos: [], totalAvancado: 0, totalPerdido: 0 })
  })

  it('quebra zero explícita é igual a não informar', () => {
    const plano = planejarConclusao([item('a', 30)], new Map([['a', estado(30)]]), new Map([['a', 0]]))
    expect(plano.acoes[0]).toMatchObject({ avancar: 30, perder: 0 })
  })
})

describe('chaveDaConclusao', () => {
  it('é a mesma para a mesma fornada, lote e papel', () => {
    expect(chaveDaConclusao('q1', 'l1', 'avanco')).toBe(chaveDaConclusao('q1', 'l1', 'avanco'))
  })

  it('separa avanço de perda — são dois movimentos distintos do mesmo lote', () => {
    expect(chaveDaConclusao('q1', 'l1', 'avanco')).not.toBe(chaveDaConclusao('q1', 'l1', 'perda'))
  })

  it('separa fornadas e lotes', () => {
    expect(chaveDaConclusao('q1', 'l1', 'avanco')).not.toBe(chaveDaConclusao('q2', 'l1', 'avanco'))
    expect(chaveDaConclusao('q1', 'l1', 'avanco')).not.toBe(chaveDaConclusao('q1', 'l2', 'avanco'))
  })
})

/*
 * Os casos que a revisão adversarial trouxe. Cada um destes já teria deixado a
 * fornada presa ou o saldo errado em produção.
 */
describe('planejarConclusao — o que a revisão pegou', () => {
  it('sem etapa de queima no roteiro é BLOQUEIO, não aviso de "já saiu"', () => {
    const plano = planejarConclusao([item('a', 30, 'L-0031', 'BULE')], new Map(), new Map())
    expect(plano.bloqueios).toHaveLength(1)
    expect(plano.bloqueios[0]).toContain('L-0031')
    expect(plano.bloqueios[0]).toContain('aguarda carga')
    expect(plano.avisos).toEqual([])
    expect(plano.acoes).toEqual([])
  })

  it('próxima etapa escolhe o esmalte e o lote está neutro: bloqueia em vez de estourar no avanço', () => {
    const plano = planejarConclusao(
      [item('a', 30, 'L-0031')],
      new Map([['a', { saldo: 30, etapaId: 'q1', proximaEtapaId: 'esmaltacao', proximaDefineCor: true, corDoLote: null }]]),
      new Map(),
    )
    expect(plano.bloqueios[0]).toContain('esmalte')
    expect(plano.acoes).toEqual([])
  })

  it('próxima etapa escolhe o esmalte mas o lote JÁ tem cor: avança, levando a cor junto', () => {
    const plano = planejarConclusao(
      [item('a', 30)],
      new Map([['a', { saldo: 30, etapaId: 'q1', proximaEtapaId: 'esmaltacao', proximaDefineCor: true, corDoLote: 'azul' }]]),
      new Map(),
    )
    expect(plano.bloqueios).toEqual([])
    expect(plano.acoes[0]).toMatchObject({ avancar: 30, corId: 'azul' })
  })

  it('destino comum não manda cor nenhuma', () => {
    const plano = planejarConclusao([item('a', 30)], new Map([['a', estado(30)]]), new Map())
    expect(plano.acoes[0].corId).toBeNull()
  })

  /*
   * A SEGUNDA TENTATIVA. A perda foi gravada, o avanço não. O saldo já caiu.
   * Descontar a quebra de novo deixaria 5 peças encalhadas na queima.
   */
  it('não desconta duas vezes a quebra já gravada', () => {
    const plano = planejarConclusao(
      [item('a', 30, 'L-0031')],
      new Map([['a', { saldo: 25, etapaId: 'q1', proximaEtapaId: 'biscoito', jaPerdido: 5 }]]),
      new Map([['a', 5]]), // o João redigitou o mesmo número
    )
    expect(plano.acoes[0]).toMatchObject({ avancar: 25, perder: 0 })
    expect(plano.totalAvancado).toBe(25)
    // o total mostrado continua sendo a verdade da fornada, e não "0 quebraram"
    expect(plano.totalPerdido).toBe(5)
  })

  it('na repetição, quebra diferente da gravada avisa e mantém a gravada', () => {
    const plano = planejarConclusao(
      [item('a', 30, 'L-0031')],
      new Map([['a', { saldo: 25, etapaId: 'q1', proximaEtapaId: 'biscoito', jaPerdido: 5 }]]),
      new Map([['a', 9]]),
    )
    expect(plano.acoes[0]).toMatchObject({ avancar: 25, perder: 0 })
    expect(plano.avisos.join(' ')).toContain('já estava registrada')
  })

  it('quebra gravada e saldo zerado: nada a fazer, e não vira "já saiu pelo quadro"', () => {
    const plano = planejarConclusao(
      [item('a', 5, 'L-0031')],
      new Map([['a', { saldo: 0, etapaId: 'q1', proximaEtapaId: 'biscoito', jaPerdido: 5 }]]),
      new Map([['a', 5]]),
    )
    expect(plano.acoes).toEqual([])
    expect(plano.totalPerdido).toBe(5)
    expect(plano.avisos).toEqual([])
  })

  it('um lote bloqueado não impede o plano de listar o resto — quem decide é o serviço', () => {
    const plano = planejarConclusao(
      [item('a', 30, 'L-0031'), item('b', 20, 'L-0032')],
      new Map([['b', estado(20)]]),
      new Map(),
    )
    expect(plano.bloqueios).toHaveLength(1)
    expect(plano.acoes.map((x) => x.loteId)).toEqual(['b'])
  })
})
