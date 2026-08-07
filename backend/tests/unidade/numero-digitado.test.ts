import { describe, expect, it } from 'vitest'
/*
 * A regra é do FRONTEND, mas o teste mora aqui: é onde a bateria de unidade
 * roda, e uma conta sem teste é uma conta que volta a quebrar. O arquivo é
 * plano — sem React, sem DOM — justamente para poder ser importado assim.
 */
import {
  interpretarNumero,
  podeDigitar,
  textoDoNumero,
} from '../../../frontend/src/lib/numero'

describe('interpretarNumero', () => {
  /*
   * O DEFEITO INTEIRO EM UMA LINHA: `Number('')` é zero.
   *
   * Por isso apagar o campo com o backspace deixava "0" preso nele — e, com o
   * zero preso, digitar 123 virava "0123".
   */
  it('campo vazio é NULO, e não zero', () => {
    expect(interpretarNumero('')).toBeNull()
    expect(interpretarNumero('   ')).toBeNull()
    expect(Number('')).toBe(0) // o motivo, escrito
  })

  it('zero digitado continua sendo zero', () => {
    expect(interpretarNumero('0')).toBe(0)
  })

  it('número comum passa direto', () => {
    expect(interpretarNumero('20')).toBe(20)
    expect(interpretarNumero('123')).toBe(123)
  })

  it('zero à esquerda não vira outro número', () => {
    expect(interpretarNumero('0123')).toBe(123)
    expect(interpretarNumero('007')).toBe(7)
  })

  it('vírgula é decimal, porque é o que o teclado brasileiro escreve', () => {
    expect(interpretarNumero('1,5')).toBe(1.5)
    expect(interpretarNumero('1.5')).toBe(1.5)
  })

  it('texto que não é número vira nulo em vez de NaN', () => {
    expect(interpretarNumero('abc')).toBeNull()
    expect(interpretarNumero('--')).toBeNull()
  })
})

describe('textoDoNumero', () => {
  it('nulo vira campo vazio — o campo pode ficar sem nada', () => {
    expect(textoDoNumero(null)).toBe('')
    expect(textoDoNumero(undefined)).toBe('')
  })

  it('zero vira "0", porque zero é um valor', () => {
    expect(textoDoNumero(0)).toBe('0')
  })

  it('a ida e a volta não mudam o número', () => {
    for (const n of [0, 1, 20, 365, 1.5]) {
      expect(interpretarNumero(textoDoNumero(n))).toBe(n)
    }
  })
})

describe('podeDigitar', () => {
  /*
   * Barrar na tecla, e não corrigir depois: corrigir depois é o cursor pulando
   * para o fim da linha no meio da digitação.
   */
  it('negativo nunca entra — em nenhum campo do sistema ele é intenção', () => {
    expect(podeDigitar('-')).toBe(false)
    expect(podeDigitar('-5')).toBe(false)
    expect(podeDigitar('-1', 2)).toBe(false)
  })

  it('campo vazio é digitável, senão não daria para apagar', () => {
    expect(podeDigitar('')).toBe(true)
  })

  it('inteiro recusa vírgula quando o campo é de inteiro', () => {
    expect(podeDigitar('12')).toBe(true)
    expect(podeDigitar('1,5')).toBe(false)
    expect(podeDigitar('1.5')).toBe(false)
  })

  it('campo decimal aceita o meio do caminho — "1," precisa passar para "1,5" existir', () => {
    expect(podeDigitar('1,', 2)).toBe(true)
    expect(podeDigitar('1,5', 2)).toBe(true)
    expect(podeDigitar('1.', 2)).toBe(true)
    expect(podeDigitar(',5', 2)).toBe(true)
  })

  it('letra, espaço e notação científica não entram', () => {
    for (const ruim of ['a', '1a', '1 2', '1e5', '+3']) {
      expect(podeDigitar(ruim, 2)).toBe(false)
    }
  })

  it('duas vírgulas não passam', () => {
    expect(podeDigitar('1,5,5', 2)).toBe(false)
  })
})
