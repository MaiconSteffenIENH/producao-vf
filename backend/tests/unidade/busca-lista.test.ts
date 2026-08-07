import { describe, expect, it } from 'vitest'
/*
 * A regra é do FRONTEND, mas o teste mora aqui — é onde a bateria de unidade
 * roda. O arquivo é plano, sem React, justamente para poder ser importado assim.
 */
import {
  filtrarPorBusca,
  grifar,
  normalizarBusca,
  pontuar,
  termosDe,
} from '../../../frontend/src/lib/busca'
import { normalizarBusca as doBackend } from '../../src/lib/busca'

/** As peças reais do ateliê — é com elas que a busca precisa acertar. */
const PECAS = [
  { rotulo: 'AÇUCAREIRO', extra: 'Café' },
  { rotulo: 'BOWL', extra: 'Bowls' },
  { rotulo: 'BOWL RECORTADO', extra: 'Bowls' },
  { rotulo: 'BULE', extra: 'Café' },
  { rotulo: 'CONJUNTO XÍCARA E PASSADOR', extra: 'Café' },
  { rotulo: 'COPINHO DE CAFÉ', extra: 'Café' },
  { rotulo: 'MANTEIGUEIRA FRANCESA', extra: 'Manteigueira Francesa' },
  { rotulo: 'OVAL', extra: 'Bandejas' },
  { rotulo: 'PORTA GUARDANAPO', extra: 'Utilitários' },
  { rotulo: 'PRATO DE PÃO', extra: 'Pratos' },
  { rotulo: 'PRATO DE REFEIÇÃO', extra: 'Pratos' },
  { rotulo: 'SALADEIRA', extra: 'Saladeiras' },
  { rotulo: 'TORTINHA', extra: 'Utilitários' },
  { rotulo: 'XÍCARA ANDORINHA', extra: 'Café' },
  { rotulo: 'XÍCARA BOJUDINHA', extra: 'Café' },
  { rotulo: 'XÍCARA DE CAFEZINHO', extra: 'Café' },
]

const buscar = (texto: string) => filtrarPorBusca(PECAS, texto).map((p) => p.rotulo)

describe('normalizarBusca', () => {
  /*
   * ESTE É O TESTE QUE MAIS IMPORTA AQUI.
   *
   * A coluna `nome_busca` do banco é preenchida pela versão do backend. Se a
   * tela normalizasse de outro jeito, a mesma palavra acharia numa busca e não
   * na outra — e ninguém ligaria isso a "duas funções parecidas em dois
   * arquivos".
   */
  it('é idêntica à do backend, que é quem preenche `nome_busca`', () => {
    for (const t of [
      'XÍCARA ANDORINHA',
      'PRATO DE PÃO',
      'AÇUCAREIRO',
      'COPINHO DE CAFÉ',
      '  Bowl Recortado  ',
      'José',
      'ÀÉÎÕÜ ç',
    ]) {
      expect(normalizarBusca(t)).toBe(doBackend(t))
    }
  })

  it('tira acento, caixa e sobra das pontas', () => {
    expect(normalizarBusca('  PRATO DE PÃO ')).toBe('prato de pao')
    expect(normalizarBusca('AÇUCAREIRO')).toBe('acucareiro')
  })
})

describe('termosDe', () => {
  it('quebra em palavras e ignora espaço sobrando', () => {
    expect(termosDe('  prato   refeicao ')).toEqual(['prato', 'refeicao'])
  })

  it('texto vazio não vira um termo vazio', () => {
    expect(termosDe('')).toEqual([])
    expect(termosDe('   ')).toEqual([])
  })
})

describe('filtrarPorBusca — os casos do ateliê', () => {
  it('campo vazio devolve a lista inteira, na ordem que veio', () => {
    expect(buscar('')).toEqual(PECAS.map((p) => p.rotulo))
  })

  it('"xic" acha as quatro peças com xícara, sem acento', () => {
    expect(buscar('xic')).toHaveLength(4)
  })

  it('e as que COMEÇAM com xícara vêm antes do CONJUNTO', () => {
    const r = buscar('xic')
    expect(r.slice(0, 3).every((n) => n.startsWith('XÍCARA'))).toBe(true)
    expect(r[3]).toBe('CONJUNTO XÍCARA E PASSADOR')
  })

  /*
   * O BULE não tem "café" no nome. Aparece pela categoria — que é como a pessoa
   * pensa a lista.
   */
  it('"cafe" acha pelo nome E pela categoria', () => {
    const r = buscar('cafe')
    expect(r).toContain('COPINHO DE CAFÉ')
    expect(r).toContain('XÍCARA DE CAFEZINHO')
    expect(r).toContain('BULE')
  })

  it('mas o acerto no nome vem sempre antes do acerto na categoria', () => {
    const r = buscar('cafe')
    expect(r.indexOf('COPINHO DE CAFÉ')).toBeLessThan(r.indexOf('BULE'))
  })

  it('"pao" acha PRATO DE PÃO — til não atrapalha', () => {
    expect(buscar('pao')).toEqual(['PRATO DE PÃO'])
  })

  /*
   * Digitar a segunda palavra tem de ESTREITAR. Se "prato refeicao" devolvesse
   * todos os pratos, ninguém digitaria a segunda palavra nunca mais.
   */
  it('duas palavras fora de ordem estreitam até a peça certa', () => {
    expect(buscar('prato refeicao')).toEqual(['PRATO DE REFEIÇÃO'])
    expect(buscar('refeicao prato')).toEqual(['PRATO DE REFEIÇÃO'])
  })

  it('"bowl r" põe BOWL RECORTADO na frente de BOWL', () => {
    expect(buscar('bowl r')[0]).toBe('BOWL RECORTADO')
  })

  it('acerto no meio da palavra ainda conta', () => {
    expect(buscar('zinho')).toEqual(['XÍCARA DE CAFEZINHO'])
  })

  it('digitar COM acento e maiúscula funciona igual', () => {
    expect(buscar('XÍCARA')).toEqual(buscar('xicara'))
  })

  it('o que não existe devolve lista vazia, e não a lista inteira', () => {
    expect(buscar('zzz')).toEqual([])
  })

  it('a ordem é estável: mesma busca, mesma lista, mesmo resultado', () => {
    expect(buscar('bowl')).toEqual(buscar('bowl'))
    const invertida = filtrarPorBusca([...PECAS].reverse(), 'bowl').map((p) => p.rotulo)
    expect(invertida).toEqual(buscar('bowl'))
  })

  it('item sem `extra` não estoura', () => {
    expect(filtrarPorBusca([{ rotulo: 'BRANCO' }], 'bra')).toHaveLength(1)
    expect(filtrarPorBusca([{ rotulo: 'BRANCO', extra: null }], 'zzz')).toHaveLength(0)
  })
})

describe('pontuar', () => {
  it('sem termo nenhum, todo item empata', () => {
    expect(pontuar({ rotulo: 'BOWL' }, [])).toBe(0)
  })

  it('começar com vale mais que começo de palavra, que vale mais que o meio', () => {
    const comeca = pontuar({ rotulo: 'BOWL RECORTADO' }, ['bowl'])
    const palavra = pontuar({ rotulo: 'BOWL RECORTADO' }, ['rec'])
    const meio = pontuar({ rotulo: 'BOWL RECORTADO' }, ['cort'])
    const extra = pontuar({ rotulo: 'BULE', extra: 'Café' }, ['cafe'])
    expect(comeca).toBeGreaterThan(palavra)
    expect(palavra).toBeGreaterThan(meio)
    expect(meio).toBeGreaterThan(extra)
  })

  it('termo que não acha nada elimina o item, mesmo com os outros acertando', () => {
    expect(pontuar({ rotulo: 'BOWL RECORTADO' }, ['bowl', 'zzz'])).toBe(-1)
  })
})

describe('grifar', () => {
  it('marca só o pedaço que casou', () => {
    expect(grifar('BOWL RECORTADO', 'bowl r')).toEqual([
      { texto: 'BOWL', forte: true },
      { texto: ' ', forte: false },
      { texto: 'R', forte: true },
      { texto: 'ECORTADO', forte: false },
    ])
  })

  it('sem busca, devolve o rótulo inteiro sem grifo', () => {
    expect(grifar('BOWL', '')).toEqual([{ texto: 'BOWL', forte: false }])
  })

  /*
   * O grifo conta LETRAS do texto original, e o acento não muda o comprimento
   * em português — é por isso que dá para marcar sem o pedaço escorregar.
   */
  it('o acento não desloca o grifo', () => {
    const p = grifar('PRATO DE PÃO', 'pao')
    expect(p.map((x) => x.texto).join('')).toBe('PRATO DE PÃO')
    expect(p.find((x) => x.forte)?.texto).toBe('PÃO')
  })

  it('a junção dos pedaços é sempre o rótulo original', () => {
    for (const busca of ['', 'x', 'xic', 'prato refeicao', 'zzz']) {
      for (const p of ['XÍCARA ANDORINHA', 'PRATO DE REFEIÇÃO', 'BOWL']) {
        expect(grifar(p, busca).map((x) => x.texto).join('')).toBe(p)
      }
    }
  })
})
