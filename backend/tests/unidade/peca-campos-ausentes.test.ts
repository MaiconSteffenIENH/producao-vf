import { describe, expect, it } from 'vitest'
import { pecaSchema } from '../../src/schemas'

/*
 * O APP FICA EM CACHE, E A TELA ANTIGA CONTINUA SALVANDO.
 *
 * Depois de publicar, um celular do ateliê ainda tem a versão anterior da tela
 * de peças. Ela edita e salva sem mandar os campos que acabaram de nascer —
 * ficha técnica e insumos — porque nem sabe que eles existem.
 *
 * Se o schema preencher esses campos com zero, nulo ou lista vazia, essa edição
 * vira uma ordem de APAGAR o que outra pessoa acabou de cadastrar, e ninguém
 * fica sabendo. Já aconteceu antes com o preço da peça; estes testes existem
 * para que a próxima pessoa que for "arrumar" o schema veja o motivo.
 *
 * A regra: campo ausente é `undefined` até o Prisma, que então não toca na
 * coluna. Nulo explícito continua apagando, porque aí foi alguém que limpou o
 * campo na tela.
 */

const CORPO_DA_TELA_ANTIGA = {
  nome: 'BOWL',
  categoriaId: '11111111-1111-1111-1111-111111111111',
  tempoMedioDias: 30,
  qtdMinimaDesejada: 10,
  observacao: '',
  ativo: true,
  roteiro: [],
  cores: [],
}

describe('edição vinda de uma versão antiga da tela', () => {
  const dados = pecaSchema.parse(CORPO_DA_TELA_ANTIGA)

  it('não inventa lista de insumos — inventar apagaria a argila cadastrada', () => {
    expect(dados.insumos).toBeUndefined()
  })

  it('não inventa medidas — inventar apagaria a ficha técnica', () => {
    expect(dados.alturaCm).toBeUndefined()
    expect(dados.larguraCm).toBeUndefined()
    expect(dados.capacidadeMl).toBeUndefined()
    expect(dados.pesoCruG).toBeUndefined()
    expect(dados.medidasMomento).toBeUndefined()
    expect(dados.medidaToleranciaPct).toBeUndefined()
  })

  it('não inventa o mínimo de biscoito nem o preço', () => {
    // os dois já saíram do cadastro de peça e são editados em outras telas
    expect(dados.qtdMinimaBiscoito).toBeUndefined()
    expect(dados.precoBase).toBeUndefined()
  })
})

describe('a tela atual continua conseguindo limpar campo', () => {
  it('nulo explícito atravessa como nulo, e não some', () => {
    const dados = pecaSchema.parse({ ...CORPO_DA_TELA_ANTIGA, alturaCm: null, medidasMomento: null })
    expect(dados.alturaCm).toBeNull()
    expect(dados.medidasMomento).toBeNull()
  })

  it('lista de insumos vazia atravessa como lista vazia — é "apague todos"', () => {
    const dados = pecaSchema.parse({ ...CORPO_DA_TELA_ANTIGA, insumos: [] })
    expect(dados.insumos).toEqual([])
  })

  it('zero na tolerância continua sendo zero, e não vira nulo', () => {
    // tolerância zero é uma escolha legítima: peça que precisa encaixar
    const dados = pecaSchema.parse({ ...CORPO_DA_TELA_ANTIGA, medidaToleranciaPct: 0, alturaCm: 8 })
    expect(dados.medidaToleranciaPct).toBe(0)
  })
})

describe('o que o formulário manda de sujeira', () => {
  it('número que chega como texto é convertido', () => {
    const dados = pecaSchema.parse({ ...CORPO_DA_TELA_ANTIGA, alturaCm: '8.5', capacidadeMl: '300' })
    expect(dados.alturaCm).toBe(8.5)
    expect(dados.capacidadeMl).toBe(300)
  })

  it('medida zero ou negativa é recusada — não é peça pequena, é digitação errada', () => {
    expect(pecaSchema.safeParse({ ...CORPO_DA_TELA_ANTIGA, alturaCm: 0 }).success).toBe(false)
    expect(pecaSchema.safeParse({ ...CORPO_DA_TELA_ANTIGA, pesoCruG: -1 }).success).toBe(false)
  })

  it('momento fora dos dois valores do processo é recusado', () => {
    expect(pecaSchema.safeParse({ ...CORPO_DA_TELA_ANTIGA, medidasMomento: 'queimado' }).success).toBe(false)
  })

  it('linha de insumo em branco chega ao service, que a filtra', () => {
    // backend leniente: quem limpa é o service, não o zod
    const dados = pecaSchema.parse({
      ...CORPO_DA_TELA_ANTIGA,
      insumos: [{ materiaPrimaId: '', quantidadePorPeca: 0 }],
    })
    expect(dados.insumos).toHaveLength(1)
  })
})
