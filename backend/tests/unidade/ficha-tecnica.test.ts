import { describe, expect, it } from 'vitest'
import {
  conferirFicha,
  consumoDeArgila,
  dentroDoPadrao,
  faixaDaMedida,
  resumoDaFicha,
  temMedida,
  type MedidasDaPeca,
} from '../../src/lib/ficha-tecnica'

const VAZIA: MedidasDaPeca = {
  alturaCm: null,
  larguraCm: null,
  capacidadeMl: null,
  pesoCruG: null,
  momento: null,
  toleranciaPct: null,
}

const ficha = (parcial: Partial<MedidasDaPeca>): MedidasDaPeca => ({ ...VAZIA, ...parcial })

describe('faixaDaMedida', () => {
  it('abre a faixa para os dois lados', () => {
    expect(faixaDaMedida(8, 5)).toEqual({ alvo: 8, minimo: 7.6, maximo: 8.4 })
  })

  it('sem tolerância, a faixa é o próprio alvo', () => {
    // não devolve null: quem desenha a linha quer o mesmo formato sempre
    expect(faixaDaMedida(8, null)).toEqual({ alvo: 8, minimo: 8, maximo: 8 })
    expect(faixaDaMedida(8, 0)).toEqual({ alvo: 8, minimo: 8, maximo: 8 })
  })

  it('arredonda para uma casa — é o que a régua do ateliê lê', () => {
    expect(faixaDaMedida(7.35, 7)).toEqual({ alvo: 7.4, minimo: 6.8, maximo: 7.9 })
  })

  it('tolerância fora do intervalo é aparada, não estoura', () => {
    expect(faixaDaMedida(10, 999).maximo).toBe(20)
    expect(faixaDaMedida(10, -5)).toEqual({ alvo: 10, minimo: 10, maximo: 10 })
  })
})

describe('dentroDoPadrao', () => {
  it('aceita o que está na faixa', () => {
    expect(dentroDoPadrao(7.8, 8, 5)).toBe(true)
    expect(dentroDoPadrao(8, 8, 5)).toBe(true)
  })

  it('recusa o que está fora', () => {
    expect(dentroDoPadrao(7.2, 8, 5)).toBe(false)
    expect(dentroDoPadrao(8.9, 8, 5)).toBe(false)
  })

  it('a borda exata da faixa passa — senão a tela se contradiz', () => {
    // a tela mostra "7,6 a 8,4"; reprovar 8,4 seria desmentir o que está escrito
    expect(dentroDoPadrao(8.4, 8, 5)).toBe(true)
    expect(dentroDoPadrao(7.6, 8, 5)).toBe(true)
  })

  it('sem tolerância só o valor exato passa', () => {
    expect(dentroDoPadrao(8, 8, null)).toBe(true)
    expect(dentroDoPadrao(8.1, 8, null)).toBe(false)
  })
})

describe('temMedida', () => {
  it('reconhece qualquer uma das quatro', () => {
    expect(temMedida(ficha({ alturaCm: 8 }))).toBe(true)
    expect(temMedida(ficha({ capacidadeMl: 300 }))).toBe(true)
    expect(temMedida(VAZIA)).toBe(false)
  })

  it('momento e tolerância sozinhos não são medida', () => {
    expect(temMedida(ficha({ momento: 'cru', toleranciaPct: 5 }))).toBe(false)
  })
})

describe('conferirFicha', () => {
  it('ficha completa e coerente não reclama', () => {
    const problemas = conferirFicha(
      ficha({ alturaCm: 8, larguraCm: 9, capacidadeMl: 300, momento: 'pronto', toleranciaPct: 5 }),
    )
    expect(problemas).toEqual([])
  })

  it('ficha vazia não reclama — peça sem padrão definido é caso normal', () => {
    expect(conferirFicha(VAZIA)).toEqual([])
  })

  it('medida sem momento é o erro que este arquivo existe para pegar', () => {
    const problemas = conferirFicha(ficha({ alturaCm: 8 }))
    expect(problemas).toHaveLength(1)
    expect(problemas[0].campo).toBe('medidasMomento')
    expect(problemas[0].mensagem).toMatch(/encolhe/)
  })

  it('momento sem medida nenhuma também é incoerente', () => {
    const problemas = conferirFicha(ficha({ momento: 'cru' }))
    expect(problemas.map((p) => p.campo)).toContain('medidasMomento')
  })

  it('tolerância sozinha não tem sobre o que incidir', () => {
    const problemas = conferirFicha(ficha({ toleranciaPct: 5 }))
    expect(problemas.map((p) => p.campo)).toContain('medidaToleranciaPct')
  })

  it('peso do cru numa ficha da peça pronta — o erro caro', () => {
    // alguém pesaria a bola de argila esperando o número da peça queimada,
    // que é 10% a 15% menor, e tornearia peça pequena a manhã inteira
    const problemas = conferirFicha(ficha({ pesoCruG: 420, momento: 'pronto' }))
    expect(problemas.map((p) => p.campo)).toContain('pesoCruG')
  })

  it('peso do cru numa ficha do cru é o esperado', () => {
    expect(conferirFicha(ficha({ pesoCruG: 420, momento: 'cru' }))).toEqual([])
  })

  it('capacidade maior que o volume que a peça comporta', () => {
    // π × 4,5² × 8 = 508,9 ml de cilindro, cortados para 508; 900 é impossível
    const problemas = conferirFicha(
      ficha({ alturaCm: 8, larguraCm: 9, capacidadeMl: 900, momento: 'pronto' }),
    )
    expect(problemas).toHaveLength(1)
    expect(problemas[0].campo).toBe('capacidadeMl')
    expect(problemas[0].mensagem).toMatch(/508 ml/)
  })

  it('capacidade compatível com as medidas passa', () => {
    expect(
      conferirFicha(ficha({ alturaCm: 8, larguraCm: 9, capacidadeMl: 300, momento: 'pronto' })),
    ).toEqual([])
  })

  it('sem altura ou sem largura não dá para conferir o volume, e não inventa erro', () => {
    expect(conferirFicha(ficha({ capacidadeMl: 9999, momento: 'pronto' }))).toEqual([])
  })

  it('junta os problemas em vez de parar no primeiro', () => {
    const problemas = conferirFicha(ficha({ pesoCruG: 420, capacidadeMl: 500, alturaCm: 2, larguraCm: 2, momento: 'pronto' }))
    expect(problemas.length).toBeGreaterThan(1)
  })
})

describe('consumoDeArgila', () => {
  it('converte o peso do barro para a unidade em que a argila é comprada', () => {
    // 420 g de barro por peça = 0,42 kg do estoque, sem ninguém digitar de novo
    expect(consumoDeArgila(420, 'kg')).toBe(0.42)
    expect(consumoDeArgila(420, 'g')).toBe(420)
  })

  it('aceita a unidade escrita de outras formas', () => {
    expect(consumoDeArgila(1000, 'Kg')).toBe(1)
    expect(consumoDeArgila(1000, ' quilos ')).toBe(1)
    expect(consumoDeArgila(50, 'GRAMAS')).toBe(50)
  })

  it('sem peso não há consumo a calcular', () => {
    expect(consumoDeArgila(null, 'kg')).toBeNull()
    expect(consumoDeArgila(0, 'kg')).toBeNull()
  })

  it('unidade que não é de massa devolve nulo em vez de inventar', () => {
    // "un" viraria "compre 420 sacos de argila", que é pior que não sugerir nada
    expect(consumoDeArgila(420, 'un')).toBeNull()
    expect(consumoDeArgila(420, 'saco')).toBeNull()
  })

  it('arredonda em três casas — a precisão com que o insumo é guardado', () => {
    expect(consumoDeArgila(1, 'kg')).toBe(0.001)
    expect(consumoDeArgila(430, 'kg')).toBe(0.43)
  })
})

describe('resumoDaFicha', () => {
  it('monta a linha do cartão', () => {
    expect(resumoDaFicha(ficha({ alturaCm: 8, larguraCm: 9, capacidadeMl: 300, momento: 'pronto', toleranciaPct: 5 })))
      .toBe('8 cm de altura · 9 cm de largura · 300 ml, ± 5%')
  })

  it('avisa quando a medida é do cru, porque muda o significado do número', () => {
    expect(resumoDaFicha(ficha({ pesoCruG: 420, momento: 'cru' }))).toBe('420 g de barro (medida no cru)')
  })

  it('sem medida devolve vazio, e quem chama decide o que dizer', () => {
    expect(resumoDaFicha(VAZIA)).toBe('')
    expect(resumoDaFicha(ficha({ momento: 'pronto', toleranciaPct: 5 }))).toBe('')
  })

  it('não escreve casa decimal à toa', () => {
    expect(resumoDaFicha(ficha({ alturaCm: 8, momento: 'pronto' }))).toBe('8 cm de altura')
    expect(resumoDaFicha(ficha({ alturaCm: 7.5, momento: 'pronto' }))).toBe('7,5 cm de altura')
  })
})
