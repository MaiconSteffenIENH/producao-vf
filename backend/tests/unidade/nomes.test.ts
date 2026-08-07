import { describe, expect, it } from 'vitest'
import { caixaAlta, caixaAltaAoDigitar, nomeDeCopia } from '../../src/lib/nomes'

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

describe('nomeDeCopia', () => {
  it('a primeira cópia não leva número', () => {
    expect(nomeDeCopia('BOWL RECORTADO', [])).toBe('BOWL RECORTADO (CÓPIA)')
  })

  it('já em caixa alta, como o cadastro guarda', () => {
    expect(nomeDeCopia('bowl recortado', [])).toBe('BOWL RECORTADO (CÓPIA)')
  })

  it('duplicar duas vezes não colide — o nome da peça é único no banco', () => {
    const existentes = ['BOWL', 'BOWL (CÓPIA)']
    expect(nomeDeCopia('BOWL', existentes)).toBe('BOWL (CÓPIA 2)')
    expect(nomeDeCopia('BOWL', [...existentes, 'BOWL (CÓPIA 2)'])).toBe('BOWL (CÓPIA 3)')
  })

  it('pula o buraco no meio — some com a cópia 2 e a próxima ainda é a 2', () => {
    expect(nomeDeCopia('BOWL', ['BOWL', 'BOWL (CÓPIA)', 'BOWL (CÓPIA 3)'])).toBe('BOWL (CÓPIA 2)')
  })

  it('a comparação ignora caixa e espaço duplo — é assim que o índice único vê', () => {
    // "Bowl (cópia)" e "BOWL (CÓPIA)" são o mesmo nome para o banco: tratá-los
    // como diferentes só adiaria a violação de unicidade para o insert
    expect(nomeDeCopia('BOWL', ['bowl (cópia)'])).toBe('BOWL (CÓPIA 2)')
    expect(nomeDeCopia('BOWL', ['BOWL  (CÓPIA)'])).toBe('BOWL (CÓPIA 2)')
  })

  it('cabe nos 80 do cadastro, senão a cópia nasce maior do que a tela salva', () => {
    const longo = 'A'.repeat(80)
    const copia = nomeDeCopia(longo, [])
    expect(copia.length).toBeLessThanOrEqual(80)
    expect(copia.endsWith(' (CÓPIA)')).toBe(true)
  })

  it('nome vazio não vira "(CÓPIA)" órfão', () => {
    expect(nomeDeCopia('', [])).toBe('PEÇA (CÓPIA)')
    expect(nomeDeCopia('   ', [])).toBe('PEÇA (CÓPIA)')
  })

  it('acento sobe junto no nome de origem', () => {
    expect(nomeDeCopia('xícara bojudinha', [])).toBe('XÍCARA BOJUDINHA (CÓPIA)')
  })
})
