import { describe, expect, it } from 'vitest'
import { calcularNovaOrdem, PRIMEIRA_POSICAO, type ItemOrdenado } from '../../src/lib/ordenacao'

/**
 * Reordenar arrastando, sem banco.
 *
 * O cenário é o das etapas de verdade: o seed numera de 10 em 10 para caber
 * uma etapa no meio, e é justamente esse remendo que o arrasto aposenta. Aqui
 * se testa o que o navegador não faz de propósito — id que sumiu, id que
 * nasceu no meio do gesto, lista que voltou igual — porque é a rede e duas
 * pessoas mexendo ao mesmo tempo que produzem esses casos.
 */

const etapas: ItemOrdenado[] = [
  { id: 'oleiro', ordem: 10 },
  { id: 'secagem', ordem: 50 },
  { id: 'queima1', ordem: 60 },
  { id: 'biscoito', ordem: 70 },
]

const idsDe = (lista: ItemOrdenado[]) => lista.map((i) => i.id)

/** Aplica o resultado sobre a lista e devolve os ids como ficariam na tela. */
const comoFicaNaTela = (atuais: ItemOrdenado[], gravar: { id: string; ordem: number }[]) => {
  const novaOrdem = new Map(gravar.map((g) => [g.id, g.ordem]))
  return [...atuais]
    .map((i) => ({ id: i.id, ordem: novaOrdem.get(i.id) ?? i.ordem }))
    .sort((a, b) => a.ordem - b.ordem)
    .map((i) => i.id)
}

describe('ordem definida arrastando', () => {
  it('a numeração vira a posição na tela: primeira linha lê 1, sem buracos', () => {
    const { gravar } = calcularNovaOrdem(etapas, idsDe(etapas))
    expect(gravar).toEqual([
      { id: 'oleiro', ordem: 1 },
      { id: 'secagem', ordem: 2 },
      { id: 'queima1', ordem: 3 },
      { id: 'biscoito', ordem: 4 },
    ])
    expect(PRIMEIRA_POSICAO).toBe(1)
  })

  it('trocar duas linhas de lugar grava só o que muda', () => {
    // já numerada 1..4, para isolar o efeito do arrasto da recompressão
    const arrumada = idsDe(etapas).map((id, i) => ({ id, ordem: i + 1 }))
    const { gravar } = calcularNovaOrdem(arrumada, ['oleiro', 'queima1', 'secagem', 'biscoito'])

    expect(gravar).toEqual([
      { id: 'queima1', ordem: 2 },
      { id: 'secagem', ordem: 3 },
    ])
    expect(comoFicaNaTela(arrumada, gravar)).toEqual(['oleiro', 'queima1', 'secagem', 'biscoito'])
  })

  it('soltar a linha no mesmo lugar não grava nada', () => {
    const arrumada = idsDe(etapas).map((id, i) => ({ id, ordem: i + 1 }))
    expect(calcularNovaOrdem(arrumada, idsDe(arrumada)).gravar).toEqual([])
  })

  it('arrastar a última para o topo empurra todas as outras uma casa', () => {
    const arrumada = idsDe(etapas).map((id, i) => ({ id, ordem: i + 1 }))
    const { gravar } = calcularNovaOrdem(arrumada, ['biscoito', 'oleiro', 'secagem', 'queima1'])

    expect(comoFicaNaTela(arrumada, gravar)).toEqual(['biscoito', 'oleiro', 'secagem', 'queima1'])
    expect(gravar).toHaveLength(4)
  })

  it('id que não existe mais é denunciado e não vira linha gravada', () => {
    const { gravar, desconhecidos } = calcularNovaOrdem(etapas, [
      'secagem',
      'etapa-que-outro-apagou',
      'oleiro',
      'queima1',
      'biscoito',
    ])

    expect(desconhecidos).toEqual(['etapa-que-outro-apagou'])
    expect(gravar.map((g) => g.id)).not.toContain('etapa-que-outro-apagou')
    // o serviço decide recusar; o cálculo em si continua coerente
    expect(comoFicaNaTela(etapas, gravar)).toEqual(['secagem', 'oleiro', 'queima1', 'biscoito'])
  })

  it('id que o cliente não citou vai para o fim, mantendo a ordem relativa', () => {
    // 'nova' nasceu depois que a tela carregou: quem arrastou nem sabe dela
    const comNovata: ItemOrdenado[] = [...etapas, { id: 'nova', ordem: 0 }]
    const { gravar, ausentes } = calcularNovaOrdem(comNovata, ['biscoito', 'oleiro', 'secagem', 'queima1'])

    expect(ausentes).toEqual(['nova'])
    expect(comoFicaNaTela(comNovata, gravar)).toEqual(['biscoito', 'oleiro', 'secagem', 'queima1', 'nova'])
  })

  it('duas linhas nunca terminam com a mesma ordem', () => {
    const comNovata: ItemOrdenado[] = [...etapas, { id: 'nova', ordem: 70 }]
    const { gravar } = calcularNovaOrdem(comNovata, ['queima1', 'oleiro'])

    const ordens = comNovata.map((i) => gravar.find((g) => g.id === i.id)?.ordem ?? i.ordem)
    expect(new Set(ordens).size).toBe(comNovata.length)
  })

  it('lista de ids vazia não mexe em nada — nem para recomprimir a numeração', () => {
    const { gravar, desconhecidos, ausentes } = calcularNovaOrdem(etapas, [])
    expect(gravar).toEqual([])
    expect(desconhecidos).toEqual([])
    expect(ausentes).toEqual(idsDe(etapas))
  })

  it('lista vazia dos dois lados não quebra', () => {
    expect(calcularNovaOrdem([], [])).toEqual({ gravar: [], desconhecidos: [], ausentes: [] })
  })

  it('só ids desconhecidos: denuncia e não grava', () => {
    const { gravar, desconhecidos } = calcularNovaOrdem(etapas, ['fantasma-1', 'fantasma-2'])
    expect(gravar).toEqual([])
    expect(desconhecidos).toEqual(['fantasma-1', 'fantasma-2'])
  })

  it('id repetido vale pela primeira aparição, e o resto continua íntegro', () => {
    const { gravar } = calcularNovaOrdem(etapas, ['biscoito', 'oleiro', 'biscoito', 'secagem', 'queima1'])
    expect(comoFicaNaTela(etapas, gravar)).toEqual(['biscoito', 'oleiro', 'secagem', 'queima1'])
  })

  it('uma categoria só: arrastar não tem para onde, e não gera escrita à toa', () => {
    expect(calcularNovaOrdem([{ id: 'bowls', ordem: 1 }], ['bowls']).gravar).toEqual([])
    // mas a que nasceu com o zero padrão do banco é acertada no primeiro arrasto
    expect(calcularNovaOrdem([{ id: 'bowls', ordem: 0 }], ['bowls']).gravar).toEqual([{ id: 'bowls', ordem: 1 }])
  })
})

/*
 * A conversão de índice do arrasto — a conta mais fácil de errar da tela.
 *
 * O ponteiro devolve um índice de INSERÇÃO (0..n, com a linha ainda no lugar
 * antigo). `reposicionar` espera um índice de ARRAY do destino. Quando a linha
 * desce, o próprio buraco que ela deixa desloca tudo em um: sem o `-1` ela cai
 * uma posição além de onde a linha-guia foi desenhada. Não é hipótese — é o
 * defeito que essa fórmula produz quando alguém a "simplifica".
 */
const paraArray = (de: number, alvo: number) => (alvo > de ? alvo - 1 : alvo)

describe('índice de inserção → índice de array', () => {
  it('descer uma casa cai logo abaixo, não duas', () => {
    // ['a','b','c'], pegar 'a' (0) e soltar entre b e c (inserção 2)
    expect(paraArray(0, 2)).toBe(1)
  })

  it('subir não desloca nada', () => {
    // pegar 'c' (2) e soltar no topo (inserção 0)
    expect(paraArray(2, 0)).toBe(0)
  })

  it('soltar no próprio lugar não mexe', () => {
    expect(paraArray(1, 1)).toBe(1)
  })

  it('primeira para o fim de uma lista de três', () => {
    expect(paraArray(0, 3)).toBe(2)
  })

  it('a fórmula ingênua erraria justamente ao descer', () => {
    const ingenua = (_de: number, alvo: number) => alvo
    expect(ingenua(0, 2)).not.toBe(paraArray(0, 2))
    // e acertaria ao subir — por isso o defeito passa despercebido
    expect(ingenua(2, 0)).toBe(paraArray(2, 0))
  })
})
