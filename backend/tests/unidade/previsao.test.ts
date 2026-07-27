import { describe, expect, it } from 'vitest'
import {
  cabeNoPrazo,
  faixaEmTexto,
  preverConclusao,
  semanasParaRepor,
  somarDias,
  type EtapaDoRoteiro,
} from '../../src/lib/previsao'

const etapa = (
  nome: string,
  ordem: number,
  diasEstimados: number,
  extra: Partial<EtapaDoRoteiro> = {},
): EtapaDoRoteiro => ({
  etapaId: nome,
  nome,
  ordem,
  diasEstimados,
  aguardaCarga: false,
  estoqueIntermediario: false,
  ...extra,
})

// roteiro parecido com o real do ateliê
const ROTEIRO: EtapaDoRoteiro[] = [
  etapa('Oleiro', 1, 2),
  etapa('Secagem', 2, 7),
  etapa('1ª Queima', 3, 2, { aguardaCarga: true }),
  etapa('Biscoito', 4, 0, { estoqueIntermediario: true }),
  etapa('Esmaltação', 5, 1),
  etapa('2ª Queima', 6, 2, { aguardaCarga: true }),
  etapa('Pronto', 7, 0),
]

describe('preverConclusao', () => {
  it('soma as etapas que faltam, não o roteiro inteiro', () => {
    const doComeco = preverConclusao(ROTEIRO, 0)
    const daEsmaltacao = preverConclusao(ROTEIRO, 4)
    expect(daEsmaltacao.diasMinimo).toBeLessThan(doComeco.diasMinimo)
    expect(daEsmaltacao.etapasRestantes).toEqual(['Esmaltação', '2ª Queima', 'Pronto'])
  })

  it('espera de forno entra na conta — é a maior incerteza', () => {
    const comForno = preverConclusao(ROTEIRO, 0)
    const semForno = preverConclusao(
      ROTEIRO.map((e) => ({ ...e, aguardaCarga: false })),
      0,
    )
    expect(comForno.esperasDeCarga).toBe(2)
    expect(comForno.diasMinimo).toBeGreaterThan(semForno.diasMinimo)
  })

  it('devolve faixa, nunca data cravada', () => {
    const p = preverConclusao(ROTEIRO, 0)
    expect(p.diasMaximo).toBeGreaterThan(p.diasMinimo)
  })

  it('avisa que o roteiro passa por estoque neutro', () => {
    expect(preverConclusao(ROTEIRO, 0).bloqueadoEmEstoque).toBe(true)
    expect(preverConclusao(ROTEIRO, 4).bloqueadoEmEstoque).toBe(false)
  })

  it('lote no fim do roteiro não tem mais prazo', () => {
    const p = preverConclusao(ROTEIRO, 7)
    expect(p.diasMinimo).toBe(0)
    expect(p.diasMaximo).toBe(0)
    expect(p.etapasRestantes).toEqual([])
  })

  it('roteiro vazio não quebra', () => {
    const p = preverConclusao([], 0)
    expect(p.diasMinimo).toBe(0)
    expect(p.explicacao).toBeTruthy()
  })

  it('dias negativos no cadastro não viram desconto de prazo', () => {
    const p = preverConclusao([etapa('Torta', 1, -5), etapa('Secagem', 2, 3)], 0)
    expect(p.diasMinimo).toBe(3)
  })
})

describe('faixaEmTexto', () => {
  it('fala como gente', () => {
    expect(faixaEmTexto(preverConclusao(ROTEIRO, 0))).toMatch(/^entre \d+ e \d+ dias$/)
    expect(faixaEmTexto(preverConclusao(ROTEIRO, 7))).toBe('pronto')
  })
})

describe('cabeNoPrazo', () => {
  const hoje = new Date('2026-07-27T12:00:00Z')

  it('mede pelo TETO da faixa, não pelo piso', () => {
    const p = preverConclusao(ROTEIRO, 0)
    const noPiso = somarDias(hoje, p.diasMinimo)
    const noTeto = somarDias(hoje, p.diasMaximo)
    // uma data que cabe no melhor caso mas não no pior deve ser recusada:
    // prometer pelo melhor caso é como se perde cliente de encomenda
    expect(cabeNoPrazo(p, hoje, noPiso)).toBe(false)
    expect(cabeNoPrazo(p, hoje, noTeto)).toBe(true)
  })

  it('prazo largo cabe', () => {
    expect(cabeNoPrazo(preverConclusao(ROTEIRO, 0), hoje, somarDias(hoje, 365))).toBe(true)
  })

  it('prazo para ontem não cabe', () => {
    expect(cabeNoPrazo(preverConclusao(ROTEIRO, 0), hoje, somarDias(hoje, -1))).toBe(false)
  })
})

describe('semanasParaRepor', () => {
  it('arredonda para cima e nunca devolve zero', () => {
    expect(semanasParaRepor(preverConclusao(ROTEIRO, 0))).toBeGreaterThanOrEqual(1)
    expect(semanasParaRepor(preverConclusao(ROTEIRO, 7))).toBe(1)
  })
})

describe('somarDias', () => {
  it('atravessa a virada do mês', () => {
    expect(somarDias(new Date('2026-01-30T12:00:00Z'), 3).toISOString().slice(0, 10)).toBe(
      '2026-02-02',
    )
  })
})
