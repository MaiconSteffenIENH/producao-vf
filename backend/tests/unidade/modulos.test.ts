import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MODULOS, MODULOS_POR_ROTA, modulosVisiveis, listaDoPapel, podeVerModulo } from '../../src/lib/modulos'

/*
 * A lista de módulos existe duas vezes, no backend e no frontend, porque os
 * dois lados precisam dela e nenhum importa código do outro. Cópia sem vigia
 * apodrece: alguém acrescenta um módulo de um lado, o menu mostra e a API
 * barra. Este teste é o vigia.
 */
describe('as duas cópias do registro', () => {
  it('backend e frontend têm exatamente os mesmos módulos, na mesma ordem', () => {
    const raiz = join(__dirname, '../..', '..')
    const doFront = readFileSync(join(raiz, 'frontend/src/lib/modulos.ts'), 'utf8')
    const chavesDoFront = [...doFront.matchAll(/chave: '([^']+)'/g)].map((m) => m[1])
    expect(chavesDoFront).toEqual(MODULOS.map((m) => m.chave))
  })
})

describe('o registro em si', () => {
  it('não tem chave repetida', () => {
    expect(new Set(MODULOS.map((m) => m.chave)).size).toBe(MODULOS.length)
  })

  it('não tem rota repetida', () => {
    expect(new Set(MODULOS.map((m) => m.rota)).size).toBe(MODULOS.length)
  })

  it('todo módulo explica o que se perde ao desligar', () => {
    // a frase é o que a pessoa lê antes de desmarcar a caixinha; meia dúzia de
    // palavras não ajuda ninguém a decidir
    for (const m of MODULOS) {
      expect(m.oQuePerde.length, `${m.chave} explica de menos`).toBeGreaterThan(35)
      expect(m.oQuePerde.trim().endsWith('.'), `${m.chave} sem ponto final`).toBe(true)
    }
  })

  it('toda rota mapeada aponta para módulo que existe', () => {
    for (const chaves of Object.values(MODULOS_POR_ROTA)) {
      for (const c of chaves) expect(MODULOS.map((m) => m.chave)).toContain(c)
    }
  })
})

describe('modulosVisiveis', () => {
  const todos = MODULOS.map((m) => m.chave)

  it('papel sem lista vê tudo — é o estado de hoje e mudá-lo trancaria todo mundo', () => {
    expect(modulosVisiveis([], {}, true).map((m) => m.chave)).toEqual(todos)
    expect(modulosVisiveis([], null, true).map((m) => m.chave)).toEqual(todos)
  })

  it('papel com lista vê só o que está nela', () => {
    const vistos = modulosVisiveis([], { modulos: ['forno'] }, false).map((m) => m.chave)
    expect(vistos).toContain('forno')
    expect(vistos).not.toContain('precos')
  })

  it('essencial sobrevive à lista do papel — ninguém fica sem saída', () => {
    const vistos = modulosVisiveis([], { modulos: ['forno'] }, false).map((m) => m.chave)
    expect(vistos).toContain('inicio')
    expect(vistos).toContain('ajustes')
    expect(vistos).toContain('producao')
    expect(vistos).toContain('pecas')
  })

  it('essencial sobrevive até ao desligamento do ateliê', () => {
    const vistos = modulosVisiveis(['inicio', 'ajustes'], null, true).map((m) => m.chave)
    expect(vistos).toContain('inicio')
    expect(vistos).toContain('ajustes')
  })

  it('módulo desligado some até para administrador', () => {
    const vistos = modulosVisiveis(['forno'], null, true).map((m) => m.chave)
    expect(vistos).not.toContain('forno')
  })

  it('módulo de administrador não aparece para quem não é', () => {
    expect(modulosVisiveis([], null, false).map((m) => m.chave)).not.toContain('usuarios')
    expect(modulosVisiveis([], null, true).map((m) => m.chave)).toContain('usuarios')
  })

  it('desligado ganha da lista do papel', () => {
    const vistos = modulosVisiveis(['forno'], { modulos: ['forno'] }, true).map((m) => m.chave)
    expect(vistos).not.toContain('forno')
  })
})

describe('listaDoPapel', () => {
  it('devolve null quando o papel não restringe', () => {
    expect(listaDoPapel(null)).toBeNull()
    expect(listaDoPapel({})).toBeNull()
    expect(listaDoPapel({ modulos: 'forno' })).toBeNull()
    expect(listaDoPapel('qualquer coisa')).toBeNull()
  })

  it('ignora o que não é texto dentro da lista', () => {
    const lista = listaDoPapel({ modulos: ['forno', 7, null, 'fotos'] })
    expect([...(lista ?? [])]).toEqual(['forno', 'fotos'])
  })

  it('lista vazia é restrição de verdade, não ausência de restrição', () => {
    // sem isto, papel configurado para não ver nada veria tudo
    expect(listaDoPapel({ modulos: [] })).toEqual(new Set())
  })
})

describe('podeVerModulo', () => {
  it('barra o que não está liberado', () => {
    expect(podeVerModulo('precos', [], { modulos: ['forno'] }, false)).toBe(false)
    expect(podeVerModulo('forno', [], { modulos: ['forno'] }, false)).toBe(true)
  })
})
