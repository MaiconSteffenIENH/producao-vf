import { describe, expect, it } from 'vitest'
import { calcularSaldos, saldoNaEtapa, saldoTotalDoLote, type MovimentoBruto } from '../src/lib/saldos'

/**
 * A regra mais importante do sistema, testada sem banco: o saldo de um lote em
 * cada etapa é a soma do livro-razão, e não um campo que alguém atualiza.
 *
 * Cenário: 40 peças entram, caminham até o biscoito, 20 são separadas para
 * esmaltar numa cor, 3 quebram na segunda queima e 17 chegam em Pronto.
 */

const OLEIRO = 'e-oleiro'
const SECAGEM = 'e-secagem'
const QUEIMA1 = 'e-queima1'
const BISCOITO = 'e-biscoito'
const ESMALTE = 'e-esmalte'
const QUEIMA2 = 'e-queima2'
const PRONTO = 'e-pronto'

const PAI = 'L-0001'
const FILHO = 'L-0002'

const mov = (
  loteId: string,
  etapaOrigemId: string | null,
  etapaDestinoId: string | null,
  quantidade: number,
): MovimentoBruto => ({ loteId, etapaOrigemId, etapaDestinoId, quantidade })

const HISTORICO: MovimentoBruto[] = [
  mov(PAI, null, OLEIRO, 40), // abertura
  mov(PAI, OLEIRO, SECAGEM, 40),
  mov(PAI, SECAGEM, QUEIMA1, 40),
  mov(PAI, QUEIMA1, BISCOITO, 40),
  mov(PAI, BISCOITO, null, 20), // separadas para virar o lote-filho
  mov(FILHO, null, BISCOITO, 20),
  mov(FILHO, BISCOITO, ESMALTE, 20),
  mov(FILHO, ESMALTE, QUEIMA2, 20),
  mov(FILHO, QUEIMA2, null, 3), // perda
  mov(FILHO, QUEIMA2, PRONTO, 17),
]

describe('saldo derivado do livro-razão', () => {
  const saldos = calcularSaldos(HISTORICO)

  it('o pai fica com o biscoito que sobrou, e só isso', () => {
    expect(saldoNaEtapa(saldos, PAI, BISCOITO)).toBe(20)
    expect(saldoTotalDoLote(saldos, PAI)).toBe(20)
  })

  it('o filho chega em Pronto com 17 — as 3 perdidas somem do saldo', () => {
    expect(saldoNaEtapa(saldos, FILHO, PRONTO)).toBe(17)
    expect(saldoTotalDoLote(saldos, FILHO)).toBe(17)
  })

  it('etapa zerada não aparece — cartão vazio no Kanban só polui', () => {
    expect(saldos.get(PAI)?.has(OLEIRO)).toBe(false)
    expect(saldos.get(FILHO)?.has(QUEIMA2)).toBe(false)
  })

  it('nada se perde no caminho: 40 entraram, 20 + 17 sobraram, 3 quebraram', () => {
    const vivos = saldoTotalDoLote(saldos, PAI) + saldoTotalDoLote(saldos, FILHO)
    const perdas = 3
    expect(vivos + perdas).toBe(40)
  })

  it('movimentação parcial não precisa de caso especial', () => {
    // metade avança, metade fica
    const parcial = calcularSaldos([mov('L-9', null, SECAGEM, 30), mov('L-9', SECAGEM, QUEIMA1, 12)])
    expect(saldoNaEtapa(parcial, 'L-9', SECAGEM)).toBe(18)
    expect(saldoNaEtapa(parcial, 'L-9', QUEIMA1)).toBe(12)
  })

  it('lote que voltou uma etapa continua batendo', () => {
    const comRetorno = calcularSaldos([
      mov('L-8', null, ESMALTE, 10),
      mov('L-8', ESMALTE, QUEIMA2, 10),
      mov('L-8', QUEIMA2, ESMALTE, 4), // reesmaltar
    ])
    expect(saldoNaEtapa(comRetorno, 'L-8', QUEIMA2)).toBe(6)
    expect(saldoNaEtapa(comRetorno, 'L-8', ESMALTE)).toBe(4)
    expect(saldoTotalDoLote(comRetorno, 'L-8')).toBe(10)
  })

  it('lote inteiramente perdido some do mapa em vez de virar saldo negativo', () => {
    const perdido = calcularSaldos([mov('L-7', null, SECAGEM, 5), mov('L-7', SECAGEM, null, 5)])
    expect(perdido.has('L-7')).toBe(false)
    expect(saldoTotalDoLote(perdido, 'L-7')).toBe(0)
  })

  it('lote sem nenhum movimento não quebra nada', () => {
    const vazio = calcularSaldos([])
    expect(vazio.size).toBe(0)
    expect(saldoTotalDoLote(vazio, 'qualquer')).toBe(0)
  })
})
