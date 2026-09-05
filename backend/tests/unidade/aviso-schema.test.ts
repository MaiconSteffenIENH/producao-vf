import { describe, expect, it } from 'vitest'
import { avisoSchema } from '../../src/schemas'

/*
 * MESMO RISCO DA FICHA TÉCNICA DA PEÇA, UM ANDAR ACIMA.
 *
 * O app é PWA e fica em cache. Depois de publicar um campo novo no aviso, um
 * celular do ateliê continua com a tela anterior e salva sem mandar esse campo.
 *
 * Se o schema completar o que faltou com nulo ou string vazia, essa edição vira
 * ordem de APAGAR o que outra pessoa escreveu — e some justamente o prazo, que
 * é o que pinta o menu. Ausente tem que continuar ausente até o service.
 */
describe('campo ausente continua ausente', () => {
  it('edição parcial não inventa detalhe nem prazo', () => {
    const lido = avisoSchema.partial().parse({ titulo: 'DESPACHAR BANDEJA' })
    expect('detalhe' in lido).toBe(false)
    expect('prazo' in lido).toBe(false)
  })

  it('nulo explícito passa, porque é "limpei na tela"', () => {
    const lido = avisoSchema.partial().parse({ prazo: null, detalhe: null })
    expect(lido.prazo).toBeNull()
    expect(lido.detalhe).toBeNull()
  })

  it('string vazia do input date passa e vira sem prazo no service', () => {
    expect(avisoSchema.partial().parse({ prazo: '' }).prazo).toBe('')
  })
})

describe('o que o schema recusa', () => {
  it('título vazio', () => {
    expect(avisoSchema.safeParse({ titulo: '' }).success).toBe(false)
    expect(avisoSchema.safeParse({ titulo: '   ' }).success).toBe(false)
  })

  it('título sem nada no lugar', () => {
    expect(avisoSchema.safeParse({}).success).toBe(false)
  })

  it('data fora do formato AAAA-MM-DD', () => {
    expect(avisoSchema.safeParse({ titulo: 'X', prazo: '11/09/2026' }).success).toBe(false)
    expect(avisoSchema.safeParse({ titulo: 'X', prazo: '2026-9-1' }).success).toBe(false)
  })

  it('título longo demais para caber no card', () => {
    expect(avisoSchema.safeParse({ titulo: 'A'.repeat(141) }).success).toBe(false)
  })
})

describe('o que o schema aceita', () => {
  it('aviso mínimo: só o que precisa ser feito', () => {
    const lido = avisoSchema.parse({ titulo: 'CONFERIR CAIXA DE ENVIO' })
    expect(lido.titulo).toBe('CONFERIR CAIXA DE ENVIO')
  })

  it('aviso completo', () => {
    const lido = avisoSchema.parse({
      titulo: 'Despachar bandeja de tortinha',
      detalhe: 'Cliente avisado que sai na sexta.',
      prazo: '2026-09-11',
    })
    expect(lido.prazo).toBe('2026-09-11')
  })

  it('espaço em volta do título é aparado', () => {
    expect(avisoSchema.parse({ titulo: '  Comprar argila  ' }).titulo).toBe('Comprar argila')
  })
})
