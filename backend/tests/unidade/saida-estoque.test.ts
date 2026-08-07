import { describe, expect, it } from 'vitest'
import {
  distribuirBaixa,
  distribuirDevolucao,
  frasePaciente,
  MOTIVOS_DE_SAIDA,
  mensagemDeMotivoDeSaidaInvalido,
  motivoDeSaida,
  rotuloDaSaida,
  type LoteComSaldo,
} from '../../src/lib/saida-estoque'

const lote = (codigo: string, saldo: number, dia: string, etapaId = 'pronto'): LoteComSaldo => ({
  loteId: codigo,
  codigo,
  etapaId,
  saldo,
  abertoEm: new Date(`${dia}T15:00:00.000Z`),
})

describe('MOTIVOS_DE_SAIDA', () => {
  it('cobre os quatro caminhos que o ateliê tem, mais a volta da feira', () => {
    const valores = MOTIVOS_DE_SAIDA.map((m) => m.valor)
    expect(valores).toContain('venda')
    expect(valores).toContain('feira')
    expect(valores).toContain('devolucao_feira')
    expect(valores).toContain('brinde')
    expect(valores).toContain('uso_proprio')
    expect(valores).toContain('quebra_pronta')
  })

  /*
   * A regra que este arquivo existe para proteger: peça vendida NÃO entra na
   * taxa de perda. Se entrasse, o planejamento mandaria produzir a mais e o
   * custo por peça cobraria de todo mundo a "quebra" de quem comprou.
   */
  it('só a peça que quebrou conta como perda', () => {
    const perdas = MOTIVOS_DE_SAIDA.filter((m) => m.ehPerda)
    expect(perdas.map((m) => m.valor)).toEqual(['quebra_pronta'])
  })

  it('todo motivo de entrada diz qual saída ele desfaz', () => {
    const entradas = MOTIVOS_DE_SAIDA.filter((m) => m.sentido === 'entrada')
    expect(entradas.map((m) => m.valor)).toEqual(['devolucao_feira', 'estorno_venda'])
    for (const e of entradas) {
      // `reverteDe` cravado em 'feira' no serviço fazia a correção de uma venda
      // procurar devolução entre as idas à feira, não achar nada, e responder
      // que tinha devolvido
      expect(e.reverteDe).toBeTruthy()
      expect(MOTIVOS_DE_SAIDA.some((m) => m.valor === e.reverteDe && m.sentido === 'saida')).toBe(true)
    }
  })

  it('motivo de saída não tem reverteDe', () => {
    for (const m of MOTIVOS_DE_SAIDA.filter((x) => x.sentido === 'saida')) {
      expect(m.reverteDe).toBeUndefined()
    }
  })

  it('todo motivo tem rótulo e ajuda escritos', () => {
    for (const m of MOTIVOS_DE_SAIDA) {
      expect(m.rotulo.length).toBeGreaterThan(2)
      expect(m.ajuda.length).toBeGreaterThan(20)
    }
  })

  it('reconhece motivo válido e recusa o resto', () => {
    expect(motivoDeSaida('venda')?.rotulo).toBe('Venda')
    expect(motivoDeSaida('vendido')).toBeNull()
    expect(motivoDeSaida(null)).toBeNull()
    expect(motivoDeSaida(42)).toBeNull()
  })

  it('a mensagem de recusa lista o que vale, em vez de só dizer "inválido"', () => {
    const msg = mensagemDeMotivoDeSaidaInvalido('vendido')
    expect(msg).toContain('vendido')
    expect(msg).toContain('Venda')
    expect(msg).toContain('Brinde ou amostra')
  })

  it('rótulo de valor desconhecido não estoura nem some', () => {
    expect(rotuloDaSaida(null)).toBe('Não informado')
    expect(rotuloDaSaida('coisa_antiga')).toBe('coisa_antiga')
  })
})

describe('distribuirBaixa', () => {
  it('tira do lote mais antigo primeiro', () => {
    const d = distribuirBaixa(
      [lote('L-0009', 10, '2026-08-01'), lote('L-0002', 10, '2026-06-01')],
      6,
    )
    expect(d.fatias).toEqual([{ loteId: 'L-0002', codigo: 'L-0002', etapaId: 'pronto', quantidade: 6 }])
    expect(d).toMatchObject({ baixado: 6, faltou: 0 })
  })

  it('atravessa lotes quando um não basta', () => {
    const d = distribuirBaixa(
      [lote('L-0002', 4, '2026-06-01'), lote('L-0009', 10, '2026-08-01')],
      6,
    )
    expect(d.fatias).toEqual([
      { loteId: 'L-0002', codigo: 'L-0002', etapaId: 'pronto', quantidade: 4 },
      { loteId: 'L-0009', codigo: 'L-0009', etapaId: 'pronto', quantidade: 2 },
    ])
    expect(d.baixado).toBe(6)
  })

  /*
   * Vender peça feita antes de o sistema existir é normal. Recusar a venda por
   * isso trocaria um número impreciso por um número que não existe.
   */
  it('estoque insuficiente devolve `faltou`, e não erro', () => {
    const d = distribuirBaixa([lote('L-0002', 3, '2026-06-01')], 12)
    expect(d).toMatchObject({ baixado: 3, faltou: 9 })
    expect(d.fatias).toHaveLength(1)
  })

  it('estoque zerado baixa nada, sem estourar', () => {
    expect(distribuirBaixa([], 5)).toMatchObject({ fatias: [], baixado: 0, faltou: 5 })
    expect(distribuirBaixa([lote('L-1', 0, '2026-06-01')], 5).faltou).toBe(5)
  })

  it('duas etapas finais são duas pilhas do mesmo lote, e as duas contam', () => {
    const d = distribuirBaixa(
      [lote('L-1', 4, '2026-06-01', 'pronto'), lote('L-1', 6, '2026-06-01', 'pronto-2')],
      9,
    )
    expect(d.baixado).toBe(9)
    expect(d.fatias.map((f) => f.etapaId)).toEqual(['pronto', 'pronto-2'])
  })

  it('lote com saldo zero é ignorado em vez de virar fatia vazia', () => {
    const d = distribuirBaixa([lote('L-1', 0, '2026-01-01'), lote('L-2', 5, '2026-06-01')], 3)
    expect(d.fatias).toEqual([{ loteId: 'L-2', codigo: 'L-2', etapaId: 'pronto', quantidade: 3 }])
  })

  /*
   * Sem desempate, dois lotes do mesmo dia sairiam em ordem de id — e a mesma
   * baixa, no mesmo estoque, produziria históricos diferentes conforme o dia.
   */
  it('empate de data desempata por código, para o resultado ser estável', () => {
    const a = distribuirBaixa([lote('L-0007', 5, '2026-06-01'), lote('L-0003', 5, '2026-06-01')], 5)
    const b = distribuirBaixa([lote('L-0003', 5, '2026-06-01'), lote('L-0007', 5, '2026-06-01')], 5)
    expect(a).toEqual(b)
    expect(a.fatias[0].codigo).toBe('L-0003')
  })

  it('quantidade zero, negativa ou quebrada não move nada', () => {
    for (const q of [0, -3, 2.5]) {
      expect(distribuirBaixa([lote('L-1', 10, '2026-06-01')], q).fatias).toEqual([])
    }
  })

  it('baixa exatamente o estoque inteiro fecha sem sobra', () => {
    const d = distribuirBaixa([lote('L-1', 4, '2026-06-01'), lote('L-2', 6, '2026-07-01')], 10)
    expect(d).toMatchObject({ baixado: 10, faltou: 0 })
    expect(d.fatias).toHaveLength(2)
  })
})

describe('distribuirDevolucao', () => {
  const saida = (codigo: string, saiu: number, dia: string) => ({
    loteId: codigo,
    codigo,
    etapaId: 'pronto',
    saiu,
    saidaEm: new Date(`${dia}T15:00:00.000Z`),
  })

  it('devolve ao lote que saiu por ÚLTIMO — desfaz o que acabou de acontecer', () => {
    const d = distribuirDevolucao([saida('L-1', 5, '2026-06-01'), saida('L-2', 5, '2026-08-01')], 3)
    expect(d.fatias).toEqual([{ loteId: 'L-2', codigo: 'L-2', etapaId: 'pronto', quantidade: 3 }])
  })

  /*
   * O teto é o que de fato saiu. Sem ele, "devolver" criaria peça do nada — e
   * peça que nasce sem passar pela produção estraga a taxa de perda, o custo
   * por peça e a conta de quanto o ateliê consegue fazer.
   */
  it('não devolve mais do que saiu', () => {
    const d = distribuirDevolucao([saida('L-1', 4, '2026-06-01')], 10)
    expect(d).toMatchObject({ baixado: 4, faltou: 6 })
  })

  it('nada saiu, nada volta', () => {
    expect(distribuirDevolucao([], 5)).toMatchObject({ baixado: 0, faltou: 5 })
  })

  it('atravessa lotes, do mais recente para o mais antigo', () => {
    const d = distribuirDevolucao(
      [saida('L-1', 2, '2026-06-01'), saida('L-2', 3, '2026-08-01')],
      5,
    )
    expect(d.fatias.map((f) => f.codigo)).toEqual(['L-2', 'L-1'])
    expect(d.baixado).toBe(5)
  })
})

describe('frasePaciente', () => {
  it('cala quando deu tudo certo', () => {
    expect(frasePaciente(12, 12, 0)).toBeNull()
  })

  it('conta exatamente o que houve na baixa parcial', () => {
    const f = frasePaciente(12, 8, 4)!
    expect(f).toContain('8')
    expect(f).toContain('12')
    expect(f).toContain('4')
  })

  it('e explica o caso de estoque zerado sem soar como erro', () => {
    const f = frasePaciente(12, 0, 12)!
    expect(f).toMatch(/nada foi baixado/i)
    expect(f).toMatch(/antes de o sistema existir/i)
  })
})

/*
 * A lista vive nos dois lados (o backend recusa, a tela oferece). Sem esta
 * conferência, mexer só num deles produziria o pior tipo de defeito: a tela
 * mostrando "Brinde" e o servidor respondendo 422 sobre um motivo que a própria
 * tela sugeriu.
 */
describe('a cópia do frontend não pode divergir', () => {
  it('os dois arquivos têm os mesmos valores e rótulos, na mesma ordem', async () => {
    const { readFileSync } = await import('node:fs')
    const { join, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const raiz = join(dirname(fileURLToPath(import.meta.url)), '../../..')

    const pares = (texto: string) =>
      [...texto.matchAll(/valor: '([^']+)',\s*\n\s*rotulo: '([^']+)'/g)].map((m) => `${m[1]}=${m[2]}`)

    const doBack = pares(readFileSync(join(raiz, 'backend/src/lib/saida-estoque.ts'), 'utf8'))
    const doFront = pares(readFileSync(join(raiz, 'frontend/src/lib/saida-estoque.ts'), 'utf8'))

    expect(doBack.length).toBe(MOTIVOS_DE_SAIDA.length)
    expect(doFront).toEqual(doBack)
  })
})
