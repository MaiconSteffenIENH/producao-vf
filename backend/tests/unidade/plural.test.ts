import { describe, expect, it } from 'vitest'
import { formaPlural, plural, pluralNome } from '../../src/lib/plural'

/*
 * Estas frases aparecem inteiras na tela de planejamento — a Vera lê todo dia.
 * O helper antigo era `singular + 's'`, e por isso o app tinha "1 peça(s)"
 * escrito à mão em vários lugares: quem escrevia a frase sabia que o helper
 * errava e desviava dele. Estes testes existem para o desvio não voltar.
 */
describe('formaPlural', () => {
  it('não flexiona no singular', () => {
    expect(formaPlural(1, 'peça')).toBe('peça')
    expect(formaPlural(-1, 'item')).toBe('item')
  })

  it('aplica a regra geral', () => {
    expect(formaPlural(2, 'peça')).toBe('peças')
    expect(formaPlural(0, 'lote')).toBe('lotes')
  })

  it('resolve as terminações que o "+s" erra', () => {
    expect(formaPlural(2, 'esmaltação')).toBe('esmaltações')
    expect(formaPlural(2, 'papel')).toBe('papéis')
    expect(formaPlural(2, 'lençol')).toBe('lençóis')
    expect(formaPlural(2, 'homem')).toBe('homens')
    expect(formaPlural(2, 'cor')).toBe('cores')
    expect(formaPlural(2, 'lápis')).toBe('lápises')
  })

  it('não aplica a regra do -l a estrangeirismo sem vogal antes', () => {
    // metade do catálogo da Vera é Bowl; a regra crua devolvia "Bowis"
    expect(formaPlural(2, 'Bowl')).toBe('Bowls')
  })

  it('conhece as irregulares que o app usa', () => {
    expect(formaPlural(3, 'item')).toBe('itens')
    expect(formaPlural(3, 'matéria-prima')).toBe('matérias-primas')
    expect(formaPlural(3, 'responsável')).toBe('responsáveis')
    expect(formaPlural(3, 'canal')).toBe('canais')
  })

  it('aceita forma explícita quando a regra não serve', () => {
    expect(formaPlural(2, 'pão', 'pães')).toBe('pães')
  })
})

describe('plural', () => {
  it('junta número e palavra', () => {
    expect(plural(1, 'peça')).toBe('1 peça')
    expect(plural(4, 'peça')).toBe('4 peças')
    // a frase real do planejamento, que antes saía "0 pronta(s)"
    expect(`Hoje: ${plural(0, 'pronta')}`).toBe('Hoje: 0 prontas')
  })
})

describe('pluralNome', () => {
  it('flexiona só o substantivo da frente, como a Gabi escreve', () => {
    expect(pluralNome(50, 'Xícara Andorinha')).toBe('50 Xícaras Andorinha')
    expect(pluralNome(18, 'Copinho de Café')).toBe('18 Copinhos de Café')
    expect(pluralNome(12, 'Prato de Refeição')).toBe('12 Pratos de Refeição')
  })

  it('não flexiona quando é uma peça só', () => {
    expect(pluralNome(1, 'Bowl Recortado')).toBe('1 Bowl Recortado')
  })

  it('aplica a regra de terminação também no nome', () => {
    expect(pluralNome(3, 'Bowl')).toBe('3 Bowls')
    expect(pluralNome(3, 'Porta Guardanapo')).toBe('3 Portas Guardanapo')
  })

  it('nunca deixa o nome do modelo no plural — este era o bug', () => {
    // o helper antigo devolvia "50 Xícara Andorinhas"
    expect(pluralNome(50, 'Xícara Andorinha')).not.toContain('Andorinhas')
  })
})

/*
 * Palavra que JÁ tem acento no radical não é oxítona, e por isso o plural não
 * ganha acento novo. A versão anterior devolvia "vendávéis" e "fácis" — foi o
 * revisor da tela de peças prontas que pegou, num rótulo que a Gabi ia ler
 * todo dia.
 */
describe('-l depois de vogal, com acento no radical', () => {
  it('vendável vira vendáveis, não vendávéis', () => {
    expect(formaPlural(2, 'vendável')).toBe('vendáveis')
  })

  it('possível vira possíveis', () => {
    expect(formaPlural(2, 'possível')).toBe('possíveis')
  })

  it('fácil vira fáceis, não fácis', () => {
    expect(formaPlural(2, 'fácil')).toBe('fáceis')
  })

  it('mas oxítona continua ganhando acento', () => {
    expect(formaPlural(2, 'papel')).toBe('papéis')
    expect(formaPlural(2, 'anzol')).toBe('anzóis')
    expect(formaPlural(2, 'funil')).toBe('funis')
  })

  it('e Bowl continua sendo Bowls', () => {
    expect(formaPlural(2, 'Bowl')).toBe('Bowls')
  })
})
