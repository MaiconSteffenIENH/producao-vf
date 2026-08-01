import { describe, expect, it } from 'vitest'
import {
  MOTIVOS_PERDA,
  MOTIVO_NAO_INFORMADO,
  MOTIVO_QUALQUER,
  ehFiltroDeMotivo,
  ehMotivoDePerda,
  mensagemDeMotivoInvalido,
  rankingDeMotivos,
  resumoDeMotivos,
  rotuloDoMotivo,
  type MovimentoDePerda,
} from '../../src/lib/motivos-perda'

const perda = (quantidade: number, motivoTipo?: string | null): MovimentoDePerda => ({
  quantidade,
  motivoTipo,
})

describe('a lista canônica', () => {
  it('não repete valor — valor repetido faria duas linhas somarem no mesmo balde', () => {
    const valores = MOTIVOS_PERDA.map((m) => m.valor)
    expect(new Set(valores).size).toBe(valores.length)
  })

  it('não usa o valor reservado do "sem motivo"', () => {
    expect(MOTIVOS_PERDA.some((m) => m.valor === MOTIVO_NAO_INFORMADO)).toBe(false)
  })

  it('tem rótulo e ajuda em todos, porque a ajuda é o que faz duas pessoas classificarem igual', () => {
    for (const motivo of MOTIVOS_PERDA) {
      expect(motivo.rotulo.trim().length).toBeGreaterThan(0)
      expect(motivo.ajuda.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('ehMotivoDePerda', () => {
  it('aceita o que está na lista', () => {
    expect(ehMotivoDePerda('trinca_secagem')).toBe(true)
    expect(ehMotivoDePerda('outro')).toBe(true)
  })

  it('recusa o que não está, inclusive o rótulo escrito em vez do valor', () => {
    expect(ehMotivoDePerda('Trincou na secagem')).toBe(false)
    expect(ehMotivoDePerda('trinca')).toBe(false)
    expect(ehMotivoDePerda('')).toBe(false)
    expect(ehMotivoDePerda(null)).toBe(false)
    expect(ehMotivoDePerda(undefined)).toBe(false)
    expect(ehMotivoDePerda(7)).toBe(false)
  })

  it('recusa o "sem motivo" e o "qualquer" — eles filtram, não se gravam', () => {
    expect(ehMotivoDePerda(MOTIVO_NAO_INFORMADO)).toBe(false)
    expect(ehMotivoDePerda(MOTIVO_QUALQUER)).toBe(false)
  })
})

describe('ehFiltroDeMotivo', () => {
  it('aceita motivo da lista, o "sem motivo" e o "qualquer"', () => {
    expect(ehFiltroDeMotivo('empeno')).toBe(true)
    expect(ehFiltroDeMotivo(MOTIVO_NAO_INFORMADO)).toBe(true)
    expect(ehFiltroDeMotivo(MOTIVO_QUALQUER)).toBe(true)
  })

  it('recusa qualquer outra coisa', () => {
    expect(ehFiltroDeMotivo('todos')).toBe(false)
    expect(ehFiltroDeMotivo('')).toBe(false)
  })
})

describe('rotuloDoMotivo', () => {
  it('traduz o valor gravado', () => {
    expect(rotuloDoMotivo('falha_esmalte')).toBe('Falha de esmalte')
  })

  it('chama de "Não informado" a perda antiga, que nunca teve motivo', () => {
    expect(rotuloDoMotivo(null)).toBe('Não informado')
    expect(rotuloDoMotivo(undefined)).toBe('Não informado')
    expect(rotuloDoMotivo('  ')).toBe('Não informado')
    expect(rotuloDoMotivo(MOTIVO_NAO_INFORMADO)).toBe('Não informado')
  })

  it('devolve como veio o valor que a lista não conhece', () => {
    // motivo antigo (nulo) e motivo estranho são problemas diferentes: juntar
    // os dois em "Não informado" esconderia o segundo para sempre
    expect(rotuloDoMotivo('trinca_no_esmalte')).toBe('trinca_no_esmalte')
  })
})

describe('mensagemDeMotivoInvalido', () => {
  it('diz o que veio errado e lista o que vale', () => {
    const mensagem = mensagemDeMotivoInvalido('trincou')
    expect(mensagem).toContain('trincou')
    expect(mensagem).toContain('Trincou na secagem')
    expect(mensagem).toContain('Quebrou no manuseio')
  })
})

describe('rankingDeMotivos', () => {
  it('lista vazia devolve ranking vazio, não uma linha de zero', () => {
    expect(rankingDeMotivos([])).toEqual([])
  })

  it('soma as perdas do mesmo motivo e ordena da maior para a menor', () => {
    const ranking = rankingDeMotivos([
      perda(3, 'quebra_forno'),
      perda(5, 'trinca_secagem'),
      perda(4, 'trinca_secagem'),
      perda(1, 'empeno'),
    ])
    expect(ranking.map((l) => [l.valor, l.quantidade])).toEqual([
      ['trinca_secagem', 9],
      ['quebra_forno', 3],
      ['empeno', 1],
    ])
  })

  it('calcula o percentual sobre o total de peças perdidas', () => {
    const ranking = rankingDeMotivos([perda(38, 'trinca_secagem'), perda(62, 'quebra_forno')])
    expect(ranking[0]).toMatchObject({ valor: 'quebra_forno', quantidade: 62, percentual: 62 })
    expect(ranking[1]).toMatchObject({ valor: 'trinca_secagem', quantidade: 38, percentual: 38 })
  })

  it('as fatias somam 100 quando a conta é exata', () => {
    const ranking = rankingDeMotivos([perda(1, 'empeno'), perda(1, 'outro'), perda(2, 'quebra_forno')])
    expect(ranking.reduce((s, l) => s + l.percentual, 0)).toBe(100)
  })

  it('guarda uma casa decimal, para motivo raro não sumir como 0%', () => {
    const ranking = rankingDeMotivos([perda(1, 'empeno'), perda(299, 'quebra_forno')])
    const empeno = ranking.find((l) => l.valor === 'empeno')
    expect(empeno?.percentual).toBe(0.3)
  })

  it('só há perda antiga: uma linha só, "Não informado", com 100%', () => {
    // é o estado do sistema no dia em que a lista entra no ar
    const ranking = rankingDeMotivos([perda(4), perda(6, null), perda(2, '')])
    expect(ranking).toEqual([
      { valor: MOTIVO_NAO_INFORMADO, rotulo: 'Não informado', quantidade: 12, percentual: 100 },
    ])
  })

  it('o "não informado" vai para o fim mesmo sendo o maior', () => {
    // ordenado por quantidade, o histórico velho enterraria justamente o
    // diagnóstico que é a razão de o ranking existir
    const ranking = rankingDeMotivos([perda(80), perda(12, 'trinca_secagem'), perda(3, 'empeno')])
    expect(ranking.map((l) => l.valor)).toEqual(['trinca_secagem', 'empeno', MOTIVO_NAO_INFORMADO])
  })

  it('mas continua contando no total — senão as fatias somariam mais que a perda real', () => {
    const ranking = rankingDeMotivos([perda(75), perda(25, 'trinca_secagem')])
    expect(ranking[0]).toMatchObject({ valor: 'trinca_secagem', percentual: 25 })
    expect(ranking[1]).toMatchObject({ valor: MOTIVO_NAO_INFORMADO, quantidade: 75, percentual: 75 })
  })

  it('empate desempata pela ordem do caminho da peça, e não pela ordem de chegada', () => {
    const ranking = rankingDeMotivos([perda(5, 'quebra_manuseio'), perda(5, 'trinca_secagem')])
    expect(ranking.map((l) => l.valor)).toEqual(['trinca_secagem', 'quebra_manuseio'])
  })

  it('ignora quantidade zero ou negativa em vez de criar linha vazia', () => {
    expect(rankingDeMotivos([perda(0, 'empeno'), perda(-3, 'outro')])).toEqual([])
    const ranking = rankingDeMotivos([perda(0, 'empeno'), perda(2, 'outro')])
    expect(ranking).toEqual([{ valor: 'outro', rotulo: 'Outro', quantidade: 2, percentual: 100 }])
  })

  it('não engole motivo desconhecido: ele aparece com o valor cru', () => {
    const ranking = rankingDeMotivos([perda(2, 'trinca_no_esmalte'), perda(1, 'empeno')])
    expect(ranking[0]).toMatchObject({ valor: 'trinca_no_esmalte', rotulo: 'trinca_no_esmalte' })
  })
})

describe('resumoDeMotivos', () => {
  it('sem perda nenhuma, tudo zerado e sem campeão', () => {
    expect(resumoDeMotivos([])).toEqual({ total: 0, comMotivo: 0, ranking: [], principal: null })
  })

  it('separa o que tem motivo do que é histórico antigo', () => {
    const resumo = resumoDeMotivos([perda(10), perda(6, 'trinca_secagem'), perda(4, 'empeno')])
    expect(resumo.total).toBe(20)
    expect(resumo.comMotivo).toBe(10)
  })

  it('o campeão nunca é o "não informado" — ele não responde nada', () => {
    const resumo = resumoDeMotivos([perda(90), perda(2, 'empeno')])
    expect(resumo.principal).toMatchObject({ valor: 'empeno', quantidade: 2 })
  })

  it('só perda antiga: total cheio e campeão nenhum', () => {
    const resumo = resumoDeMotivos([perda(7), perda(3, null)])
    expect(resumo.total).toBe(10)
    expect(resumo.comMotivo).toBe(0)
    expect(resumo.principal).toBeNull()
    expect(resumo.ranking).toHaveLength(1)
  })
})
