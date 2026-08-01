import { describe, expect, it } from 'vitest'
import {
  linhasDeBiscoito,
  visaoDasProntas,
  visaoDoBiscoito,
  type EntradaDeBiscoito,
  type EntradaDeProntas,
} from '../../src/lib/estoque'

const biscoito = (
  peca: string,
  emBiscoito: number,
  minimo: number,
  extra: Partial<EntradaDeBiscoito> = {},
): EntradaDeBiscoito => ({ pecaId: peca, peca, emBiscoito, minimo, ...extra })

const pronta = (
  peca: string,
  cor: string | null,
  prontas: number,
  extra: Partial<EntradaDeProntas> = {},
): EntradaDeProntas => ({
  pecaId: peca,
  peca,
  corId: cor,
  cor,
  prontas,
  ...extra,
})

const nomes = (linhas: { peca: string }[]) => linhas.map((l) => l.peca)

describe('estoque de biscoito — a ordem é a distância do mínimo', () => {
  it('lista vazia devolve resumo zerado, não NaN', () => {
    const { linhas, resumo } = visaoDoBiscoito([])
    expect(linhas).toEqual([])
    expect(resumo).toEqual({
      pecas: 0,
      emBiscoito: 0,
      aCaminho: 0,
      abaixoDoMinimo: 0,
      faltamNoTotal: 0,
      semMinimo: 0,
    })
  })

  it('peça zerada abre a lista, mesmo faltando menos que a outra em número absoluto', () => {
    // 0 de 10 é ruptura do pulmão: nenhuma cor sai sem começar do torno.
    // 60 de 100 falta quatro vezes mais e ainda atende quase tudo.
    const linhas = linhasDeBiscoito([biscoito('Bowl', 60, 100), biscoito('Tortinha', 0, 10)])
    expect(nomes(linhas)).toEqual(['Tortinha', 'Bowl'])
    expect(linhas[1].faltam).toBe(40)
  })

  it('estoque zerado com mínimo: falta o mínimo inteiro e a cobertura é 0%', () => {
    const [linha] = linhasDeBiscoito([biscoito('Xícara', 0, 25)])
    expect(linha.faltam).toBe(25)
    expect(linha.percentualDoMinimo).toBe(0)
    expect(linha.abaixoDoMinimo).toBe(true)
    expect(linha.semMinimo).toBe(false)
  })

  it('peça sem mínimo cadastrado nunca é "abaixo do mínimo" e vai para o fim', () => {
    // sem mínimo não há distância a percorrer; tratá-la como falta encheria o
    // topo da tela de peça que ninguém pediu
    const linhas = linhasDeBiscoito([
      biscoito('SemMinimo', 0, 0),
      biscoito('Atendida', 30, 10),
      biscoito('Faltando', 2, 10),
    ])
    expect(nomes(linhas)).toEqual(['Faltando', 'Atendida', 'SemMinimo'])
    const semMinimo = linhas[2]
    expect(semMinimo.abaixoDoMinimo).toBe(false)
    expect(semMinimo.faltam).toBe(0)
    expect(semMinimo.percentualDoMinimo).toBeNull()
    expect(semMinimo.semMinimo).toBe(true)
  })

  it('entre peças sem mínimo, quem tem mais parado aparece antes', () => {
    const linhas = linhasDeBiscoito([biscoito('Pouca', 3, 0), biscoito('Muita', 80, 0)])
    expect(nomes(linhas)).toEqual(['Muita', 'Pouca'])
  })

  it('igualmente vazias: quem não tem nada a caminho vem primeiro', () => {
    const linhas = linhasDeBiscoito([
      biscoito('ComForno', 0, 20, { aCaminho: 40 }),
      biscoito('SemNada', 0, 20),
    ])
    expect(nomes(linhas)).toEqual(['SemNada', 'ComForno'])
    expect(linhas[1].cobertoPeloQueVem).toBe(true)
    expect(linhas[0].cobertoPeloQueVem).toBe(false)
  })

  it('o que vem a caminho não abate o que falta — só avisa que a conta fecha', () => {
    const [linha] = linhasDeBiscoito([biscoito('Bowl', 5, 20, { aCaminho: 15 })])
    expect(linha.faltam).toBe(15)
    expect(linha.cobertoPeloQueVem).toBe(true)
  })

  it('a caminho insuficiente não conta como coberto', () => {
    const [linha] = linhasDeBiscoito([biscoito('Bowl', 5, 20, { aCaminho: 9 })])
    expect(linha.cobertoPeloQueVem).toBe(false)
  })

  it('entre as atendidas, quem está mais perto de cair vem antes', () => {
    const linhas = linhasDeBiscoito([biscoito('Folgada', 90, 10), biscoito('NoLimite', 10, 10)])
    expect(nomes(linhas)).toEqual(['NoLimite', 'Folgada'])
    expect(linhas[0].percentualDoMinimo).toBe(100)
    expect(linhas[1].percentualDoMinimo).toBe(900)
  })

  it('saldo negativo não vira cobertura negativa nem passa na frente de quem está zerado', () => {
    // saldo negativo não existe no livro-razão; se um dia existir, não pode
    // sequestrar o topo da lista
    const linhas = linhasDeBiscoito([biscoito('Estranha', -5, 10), biscoito('Zerada', 0, 10)])
    expect(linhas[0].emBiscoito).toBe(0)
    expect(nomes(linhas)).toEqual(['Estranha', 'Zerada']) // empate resolvido pelo nome
    expect(linhas.every((l) => (l.percentualDoMinimo ?? 0) >= 0)).toBe(true)
  })

  it('o resumo soma o que falta em todas as peças', () => {
    const { resumo } = visaoDoBiscoito([
      biscoito('A', 0, 10, { aCaminho: 4, lotes: 0 }),
      biscoito('B', 30, 20, { lotes: 2 }),
      biscoito('C', 7, 0, { lotes: 1 }),
    ])
    expect(resumo.pecas).toBe(3)
    expect(resumo.emBiscoito).toBe(37)
    expect(resumo.aCaminho).toBe(4)
    expect(resumo.abaixoDoMinimo).toBe(1)
    expect(resumo.faltamNoTotal).toBe(10)
    expect(resumo.semMinimo).toBe(1)
  })

  it('categoria e contagem de lotes atravessam sem invenção', () => {
    const [linha] = linhasDeBiscoito([biscoito('Bowl', 12, 10, { categoria: 'Mesa', lotes: 3 })])
    expect(linha.categoria).toBe('Mesa')
    expect(linha.lotes).toBe(3)
    expect(linhasDeBiscoito([biscoito('Bowl', 1, 1)])[0].categoria).toBeNull()
  })
})

describe('peças prontas — pronto não é vendável', () => {
  it('lista vazia devolve resumo zerado', () => {
    const { grupos, resumo } = visaoDasProntas([])
    expect(grupos).toEqual([])
    expect(resumo.prontas).toBe(0)
    expect(resumo.vendaveis).toBe(0)
    expect(resumo.travadas).toBe(0)
  })

  it('peça pronta sem foto publicada existe no estoque e não pode ser anunciada', () => {
    const { resumo, grupos } = visaoDasProntas([
      pronta('Bowl', 'Pistache', 12, { fotoStatus: 'editado' }),
    ])
    expect(resumo.prontas).toBe(12)
    expect(resumo.vendaveis).toBe(0)
    expect(resumo.travadas).toBe(12)
    expect(resumo.combinacoesTravadas).toBe(1)
    expect(grupos[0].linhas[0].situacao).toBe('sem_foto')
  })

  it('foto publicada é o que torna a peça vendável', () => {
    const { resumo } = visaoDasProntas([pronta('Bowl', 'Pistache', 12, { fotoStatus: 'publicado' })])
    expect(resumo.vendaveis).toBe(12)
    expect(resumo.travadas).toBe(0)
    expect(resumo.combinacoesTravadas).toBe(0)
  })

  it('combinação sem ciclo de foto cadastrado é tratada como travada, não como vendável', () => {
    // na dúvida o estoque erra para o lado seguro: anunciar o que não tem foto
    // é o erro caro
    const { resumo, grupos } = visaoDasProntas([pronta('Bowl', 'Coral', 4)])
    expect(resumo.vendaveis).toBe(0)
    expect(resumo.travadas).toBe(4)
    expect(grupos[0].linhas[0].fotoStatus).toBeNull()
  })

  it('peça que chegou ao fim sem esmalte não vende, e a foto não é a culpada', () => {
    const { resumo, grupos } = visaoDasProntas([pronta('Bowl', null, 6)])
    expect(resumo.semEsmalte).toBe(6)
    expect(resumo.vendaveis).toBe(0)
    expect(resumo.travadas).toBe(0)
    expect(resumo.combinacoesTravadas).toBe(0)
    expect(grupos[0].linhas[0].situacao).toBe('sem_esmalte')
  })

  it('o mesmo estoque separa o que vende do que está parado', () => {
    const { grupos, resumo } = visaoDasProntas([
      pronta('Bowl', 'Pistache', 4, { fotoStatus: 'publicado' }),
      pronta('Bowl', 'Coral', 6, { fotoStatus: 'pendente' }),
    ])
    expect(resumo.prontas).toBe(10)
    expect(resumo.vendaveis).toBe(4)
    expect(resumo.travadas).toBe(6)
    expect(grupos).toHaveLength(1)
    expect(grupos[0].prontas).toBe(10)
    expect(grupos[0].vendaveis).toBe(4)
  })

  it('combinação sem nenhuma peça pronta não entra: numa tela de estoque é ruído', () => {
    const { grupos, resumo } = visaoDasProntas([
      pronta('Bowl', 'Pistache', 0, { fotoStatus: 'publicado' }),
      pronta('Bowl', 'Coral', 3, { fotoStatus: 'publicado' }),
    ])
    expect(resumo.combinacoes).toBe(1)
    expect(grupos[0].linhas).toHaveLength(1)
    expect(grupos[0].linhas[0].cor).toBe('Coral')
  })

  it('peça sem nenhuma peça pronta some da lista inteira', () => {
    const { grupos } = visaoDasProntas([pronta('Xícara', 'Búzios', 0, { fotoStatus: 'publicado' })])
    expect(grupos).toEqual([])
  })

  it('a peça com mais dinheiro parado abre a lista', () => {
    const { grupos } = visaoDasProntas([
      pronta('Vendendo', 'Pistache', 50, { fotoStatus: 'publicado' }),
      pronta('Travada', 'Coral', 8, { fotoStatus: 'fotografado' }),
    ])
    expect(nomes(grupos)).toEqual(['Travada', 'Vendendo'])
  })

  it('dentro da peça, a linha travada vem antes da que já vende', () => {
    const { grupos } = visaoDasProntas([
      pronta('Bowl', 'Pistache', 30, { fotoStatus: 'publicado' }),
      pronta('Bowl', null, 9),
      pronta('Bowl', 'Coral', 2, { fotoStatus: 'enviado' }),
    ])
    expect(grupos[0].linhas.map((l) => l.situacao)).toEqual(['sem_foto', 'sem_esmalte', 'vendavel'])
  })

  it('o que está a caminho é contado à parte do que já está pronto', () => {
    const { grupos, resumo } = visaoDasProntas([
      pronta('Bowl', 'Pistache', 5, { fotoStatus: 'publicado', aCaminho: 20 }),
    ])
    expect(grupos[0].aCaminho).toBe(20)
    expect(resumo.prontas).toBe(5)
  })

  it('cor e amostra atravessam para o chip da tela', () => {
    const { grupos } = visaoDasProntas([
      pronta('Bowl', 'Pedra Sabão', 3, {
        fotoStatus: 'publicado',
        corHex: '#D5D2CA',
        malhado: true,
        amostraUrl: '/amostras/pedra.jpg',
      }),
    ])
    const linha = grupos[0].linhas[0]
    expect(linha.corHex).toBe('#D5D2CA')
    expect(linha.malhado).toBe(true)
    expect(linha.amostraUrl).toBe('/amostras/pedra.jpg')
  })
})
