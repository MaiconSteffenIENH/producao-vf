import { describe, expect, it } from 'vitest'
import {
  avaliarQuantidadeDeAbertura,
  corrigirAbertura,
  diaDaAbertura,
  DIAS_MAXIMOS_PARA_TRAS,
  ehObservacaoAutomatica,
  instanteDaAbertura,
} from '../../src/lib/abertura-lote'

// uma quarta-feira de manhã, 08:30 em Brasília (11:30 UTC)
const AGORA = new Date('2026-08-07T11:30:00.000Z')

const ok = (r: ReturnType<typeof instanteDaAbertura>) => {
  if (!r.ok) throw new Error(`esperava sucesso, veio: ${r.erro}`)
  return r.instante
}
const erro = (r: ReturnType<typeof instanteDaAbertura>) => {
  if (r.ok) throw new Error('esperava erro, veio sucesso')
  return r.erro
}

describe('instanteDaAbertura', () => {
  /*
   * O defeito que a revisão pegou: "dia" precisa ser sempre o dia DO ATELIÊ.
   * Meia-noite UTC do dia 3 é 21h do dia 2 em Novo Hamburgo, e as duas leituras
   * discordando faziam a data andar sozinha ao salvar a observação.
   */
  it('data passada vira meio-dia do ateliê', () => {
    const d = ok(instanteDaAbertura('2026-08-03', AGORA))
    expect(d.toISOString()).toBe('2026-08-03T15:00:00.000Z')
    expect(diaDaAbertura(d)).toBe('2026-08-03')
    expect(d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })).toBe('03/08/2026')
  })

  it('a ida e a volta usam a MESMA definição de dia', () => {
    for (const dia of ['2026-01-01', '2026-03-15', '2026-08-03', '2026-12-31']) {
      const r = instanteDaAbertura(dia, new Date('2026-12-31T12:00:00.000Z'))
      if (!r.ok) throw new Error(`${dia}: ${r.erro}`)
      expect(diaDaAbertura(r.instante)).toBe(dia)
    }
  })

  /*
   * Hoje é exceção: às 8h30 da manhã, meio-dia ainda não chegou. O lote nasceria
   * no futuro e "parado há X dias" ficaria negativo — no caso mais comum de todos.
   */
  it('hoje usa o instante de agora, e não meio-dia', () => {
    const d = ok(instanteDaAbertura('2026-08-07', AGORA))
    expect(d.getTime()).toBe(AGORA.getTime())
    expect(d.getTime()).toBeLessThanOrEqual(AGORA.getTime())
  })

  it('ontem é aceito', () => {
    expect(diaDaAbertura(ok(instanteDaAbertura('2026-08-06', AGORA)))).toBe('2026-08-06')
  })

  it('amanhã é recusado — lote não começa no futuro', () => {
    expect(erro(instanteDaAbertura('2026-08-08', AGORA))).toMatch(/futuro/i)
  })

  it('o limite de um ano atrás é aceito, e um dia além dele não', () => {
    const limite = new Date(AGORA.getTime() - DIAS_MAXIMOS_PARA_TRAS * 86_400_000)
    expect(instanteDaAbertura(diaDaAbertura(limite), AGORA).ok).toBe(true)

    const passou = new Date(AGORA.getTime() - (DIAS_MAXIMOS_PARA_TRAS + 1) * 86_400_000)
    expect(erro(instanteDaAbertura(diaDaAbertura(passou), AGORA))).toMatch(/ano/i)
  })

  it('ano trocado por engano cai no limite', () => {
    expect(erro(instanteDaAbertura('2025-08-03', AGORA))).toMatch(/confira o ano/i)
  })

  /*
   * `new Date(Date.UTC(2026, 1, 31))` não estoura: vira 3 de março. Guardar isso
   * seria salvar uma data que a pessoa não escolheu.
   */
  it('31 de fevereiro é recusado em vez de virar 3 de março', () => {
    expect(erro(instanteDaAbertura('2026-02-31', AGORA))).toMatch(/não é uma data que existe/i)
  })

  it('29 de fevereiro existe em ano bissexto', () => {
    const bissexto = new Date('2024-06-01T10:00:00.000Z')
    expect(instanteDaAbertura('2024-02-29', bissexto).ok).toBe(true)
  })

  it('29 de fevereiro não existe em ano comum', () => {
    const comum = new Date('2026-06-01T10:00:00.000Z')
    expect(erro(instanteDaAbertura('2026-02-29', comum))).toMatch(/não é uma data que existe/i)
  })

  it('formato fora de AAAA-MM-DD é recusado antes de virar Date', () => {
    for (const ruim of ['03/08/2026', '2026-8-3', '', 'hoje', '2026-08-03T10:00:00Z']) {
      expect(instanteDaAbertura(ruim, AGORA).ok).toBe(false)
    }
  })

  it('a virada do ano não confunde a conta de dias', () => {
    // 01/01 às 02:59 UTC ainda é 23:59 de 31/12 no ateliê — e é o dia do ateliê que vale
    const viradaUtc = new Date('2026-01-01T02:59:00.000Z')
    expect(diaDaAbertura(viradaUtc)).toBe('2025-12-31')
    expect(instanteDaAbertura('2025-12-31', viradaUtc).ok).toBe(true)
    expect(instanteDaAbertura('2026-01-01', viradaUtc).ok).toBe(false)
  })

  /*
   * A JANELA DAS 21h. `hojeTexto()` do navegador devolve o dia local; a primeira
   * versão do servidor comparava com o dia UTC. Entre 21h e meia-noite de Novo
   * Hamburgo os dois discordavam, a exceção do "hoje" era contornada, e o lote
   * nascia carimbado 13 horas no passado.
   */
  it('às 22h do ateliê, hoje ainda é hoje — e o lote não nasce no passado', () => {
    const noite = new Date('2026-08-08T01:00:00.000Z') // 22h de 07/08 no ateliê
    expect(diaDaAbertura(noite)).toBe('2026-08-07')
    const d = ok(instanteDaAbertura('2026-08-07', noite))
    expect(d.getTime()).toBe(noite.getTime())
  })

  it('e o dia seguinte, nessa mesma hora, continua sendo futuro', () => {
    const noite = new Date('2026-08-08T01:00:00.000Z')
    expect(erro(instanteDaAbertura('2026-08-08', noite))).toMatch(/futuro/i)
  })
})

describe('corrigirAbertura', () => {
  /*
   * O DEFEITO QUE ISTO EXISTE PARA MATAR.
   *
   * A tela manda a data junto em toda edição, inclusive quando a pessoa só quis
   * arrumar a observação. Sem esta saída antecipada, "hoje" virava o instante de
   * AGORA — sempre posterior a qualquer movimento — e todo lote aberto e
   * movimentado no mesmo dia ficava impossível de editar.
   */
  it('dia igual ao atual não mexe em carimbo nenhum, nem esbarra no teto', () => {
    const r = corrigirAbertura('2026-08-07', AGORA, '2026-08-07', new Date('2026-08-07T13:00:00.000Z'))
    expect(r).toEqual({ ok: true, instante: null })
  })

  it('e isso vale para um lote antigo também — reenviar a mesma data é inócuo', () => {
    const r = corrigirAbertura('2026-08-01', AGORA, '2026-08-01', new Date('2026-08-01T03:00:00.000Z'))
    expect(r).toEqual({ ok: true, instante: null })
  })

  it('aceita quando a abertura fica antes do primeiro movimento', () => {
    const r = corrigirAbertura('2026-08-03', AGORA, '2026-08-05', new Date('2026-08-05T18:00:00.000Z'))
    expect(r.ok).toBe(true)
  })

  /* Sem este teto, o lote teria avançado de etapa antes de existir. */
  it('recusa abertura depois de um movimento já registrado', () => {
    expect(
      erro(corrigirAbertura('2026-08-06', AGORA, '2026-08-01', new Date('2026-08-05T09:00:00.000Z')) as never),
    ).toMatch(/já se mexeu/i)
  })

  it('lote sem movimento nenhum depois da abertura não tem teto extra', () => {
    expect(corrigirAbertura('2026-08-01', AGORA, '2026-08-03', null).ok).toBe(true)
  })

  it('continua recusando futuro e data impossível', () => {
    expect(corrigirAbertura('2026-08-09', AGORA, '2026-08-01', null).ok).toBe(false)
    expect(corrigirAbertura('2026-02-30', AGORA, '2026-08-01', null).ok).toBe(false)
  })

  it('formato errado é recusado antes de comparar com o dia atual', () => {
    expect(corrigirAbertura('03/08/2026', AGORA, '2026-08-01', null).ok).toBe(false)
  })
})

describe('avaliarQuantidadeDeAbertura', () => {
  /* O caso do Maicon: abriu 28, era 30, e não havia como corrigir. */
  it('subir a quantidade é sempre possível', () => {
    expect(avaliarQuantidadeDeAbertura(30, 28, 0)).toEqual({ ok: true, diferenca: 2 })
  })

  it('subir vale mesmo com o lote já todo adiantado', () => {
    expect(avaliarQuantidadeDeAbertura(30, 28, 28)).toEqual({ ok: true, diferenca: 2 })
  })

  it('a mesma quantidade não é mudança', () => {
    expect(avaliarQuantidadeDeAbertura(28, 28, 28)).toEqual({ ok: true, diferenca: 0 })
  })

  it('baixar cabe até o que já saiu da primeira etapa', () => {
    // 28 abertos, 18 já seguiram adiante: dá para descer até 18
    expect(avaliarQuantidadeDeAbertura(18, 28, 18)).toEqual({ ok: true, diferenca: -10 })
  })

  it('baixar abaixo do que já saiu é recusado', () => {
    const r = avaliarQuantidadeDeAbertura(17, 28, 18)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.erro).toContain('18') // o mínimo, dito de bandeja
      expect(r.erro).toMatch(/perda/i)
    }
  })

  /*
   * O CASO QUE A SEGUNDA REVISÃO PEGOU.
   *
   * O quadro permite RETORNO de etapa. Um lote de 28 que avançou inteiro e
   * voltou inteiro tem 28 de saldo de novo — e a regra antiga, que olhava o
   * saldo, deixava baixar a abertura para 1. As outras 27 sumiam do estoque sem
   * virar perda, sem saldo negativo e sem nada na tela.
   */
  it('lote que avançou inteiro e VOLTOU inteiro não pode baixar, mesmo com saldo cheio', () => {
    // saiu 28 (e voltou), então o piso é 28 — independente do saldo atual
    expect(avaliarQuantidadeDeAbertura(1, 28, 28).ok).toBe(false)
    expect(avaliarQuantidadeDeAbertura(27, 28, 28).ok).toBe(false)
  })

  it('lote inteiro já adiantado não pode baixar nada, mas pode subir', () => {
    expect(avaliarQuantidadeDeAbertura(27, 28, 28).ok).toBe(false)
    expect(avaliarQuantidadeDeAbertura(29, 28, 28).ok).toBe(true)
  })

  it('lote que nunca se mexeu pode baixar até 1', () => {
    expect(avaliarQuantidadeDeAbertura(1, 28, 0)).toEqual({ ok: true, diferenca: -27 })
  })

  it('zero e negativo são recusados antes de qualquer conta', () => {
    expect(avaliarQuantidadeDeAbertura(0, 28, 28).ok).toBe(false)
    expect(avaliarQuantidadeDeAbertura(-5, 28, 28).ok).toBe(false)
  })

  it('quantidade quebrada é recusada', () => {
    expect(avaliarQuantidadeDeAbertura(28.5, 28, 28).ok).toBe(false)
  })
})

describe('ehObservacaoAutomatica', () => {
  /*
   * O quadro passou a exibir a observação. Sem este filtro, todo lote de divisão
   * ganharia uma tarja repetindo o "veio do L-0031" que já está logo acima.
   */
  it('reconhece o que o próprio sistema escreveu na divisão', () => {
    expect(ehObservacaoAutomatica('Dividido de L-0031.')).toBe(true)
    expect(ehObservacaoAutomatica('Separado de L-0031.')).toBe(true)
    expect(ehObservacaoAutomatica('Separado de L-0031 para esmaltar.')).toBe(true)
    expect(ehObservacaoAutomatica('  Dividido de L-0031.  ')).toBe(true)
  })

  it('não engole o que a pessoa escreveu', () => {
    expect(ehObservacaoAutomatica('Dividido de L-0031 porque a argila mudou')).toBe(false)
    expect(ehObservacaoAutomatica('Argila da leva nova, conferir retração')).toBe(false)
    expect(ehObservacaoAutomatica('')).toBe(false)
    expect(ehObservacaoAutomatica(null)).toBe(false)
  })
})
