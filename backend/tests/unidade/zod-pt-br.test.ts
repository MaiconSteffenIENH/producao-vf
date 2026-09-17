import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { caminhoLegivel, mensagensEmPortugues } from '../../src/lib/zod-pt-br'

z.setErrorMap(mensagensEmPortugues)

const primeira = (r: z.SafeParseReturnType<unknown, unknown>) =>
  r.success ? null : r.error.issues[0].message

describe('mensagens do zod em português', () => {
  it('número que não veio, ou veio como NaN', () => {
    const s = z.object({ quantidade: z.number() })
    expect(primeira(s.safeParse({}))).toBe('obrigatório')
    expect(primeira(s.safeParse({ quantidade: Number.NaN }))).toBe('informe um número')
    expect(primeira(s.safeParse({ quantidade: 'dez' }))).toBe('esperava número')
  })

  it('tamanho mínimo e máximo', () => {
    expect(primeira(z.string().min(1).safeParse(''))).toBe('obrigatório')
    expect(primeira(z.string().min(3).safeParse('ab'))).toBe('mínimo de 3 caracteres')
    expect(primeira(z.number().min(1).safeParse(0))).toBe('mínimo 1')
    expect(primeira(z.number().max(9).safeParse(10))).toBe('máximo 9')
    expect(primeira(z.array(z.string()).min(1).safeParse([]))).toBe('informe ao menos 1')
  })

  it('formato de e-mail, identificador e opção', () => {
    expect(primeira(z.string().email().safeParse('gabi'))).toBe('e-mail inválido')
    expect(primeira(z.string().uuid().safeParse('x'))).toBe('identificador inválido')
    expect(primeira(z.enum(['venda', 'brinde']).safeParse('feira'))).toBe('use um destes: venda, brinde')
  })

  it('mensagem escrita no schema continua valendo', () => {
    expect(primeira(z.number({ invalid_type_error: 'quantas peças?' }).safeParse('x'))).toBe('quantas peças?')
  })

  it('caminho legível: índice de lista vira número humano', () => {
    expect(caminhoLegivel(['itens', 1, 'pecaId'])).toBe('itens 2 pecaId')
    expect(caminhoLegivel(['quantidade'])).toBe('quantidade')
  })
})
