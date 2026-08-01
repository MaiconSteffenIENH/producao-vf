import { describe, expect, it } from 'vitest'
import { caixaAlta, caixaAltaAoDigitar } from '../../src/lib/nomes'

describe('caixaAlta', () => {
  it('põe em maiúscula sem a pessoa precisar do caps lock', () => {
    expect(caixaAlta('prato de pão')).toBe('PRATO DE PÃO')
  })

  it('acento sobe junto', () => {
    expect(caixaAlta('xícara de cafezinho')).toBe('XÍCARA DE CAFEZINHO')
    expect(caixaAlta('manteigueira francesa')).toBe('MANTEIGUEIRA FRANCESA')
    expect(caixaAlta('açucareiro')).toBe('AÇUCAREIRO')
  })

  it('o que já estava em maiúscula não muda', () => {
    expect(caixaAlta('BOWL RECORTADO')).toBe('BOWL RECORTADO')
  })

  it('número e ordinal atravessam inteiros', () => {
    expect(caixaAlta('1ª queima')).toBe('1ª QUEIMA')
    expect(caixaAlta('caixa 20x20')).toBe('CAIXA 20X20')
  })

  it('aperta o espaço duplo — senão o nome some da busca e duplica na lista', () => {
    // "PRATO  DE PÃO" e "PRATO DE PÃO" são textos diferentes para o banco
    expect(caixaAlta('prato  de   pão')).toBe('PRATO DE PÃO')
  })

  it('corta as pontas', () => {
    expect(caixaAlta('  bowl  ')).toBe('BOWL')
  })

  it('não quebra com vazio', () => {
    expect(caixaAlta('')).toBe('')
    expect(caixaAlta('   ')).toBe('')
  })
})

describe('caixaAltaAoDigitar', () => {
  it('não corta o espaço que a pessoa acabou de digitar', () => {
    // este é o ponto: apertar os espaços a cada tecla impediria de escrever
    // "PRATO DE PÃO", porque o espaço sumiria antes da próxima letra chegar
    expect(caixaAltaAoDigitar('prato ')).toBe('PRATO ')
    expect(caixaAltaAoDigitar('prato de ')).toBe('PRATO DE ')
  })

  it('não muda o comprimento — é o que impede o cursor de pular', () => {
    for (const t of ['prato de pão', 'açucareiro', 'xícara', 'ção ãõ éíóú']) {
      expect(caixaAltaAoDigitar(t)).toHaveLength(t.length)
    }
  })
})
