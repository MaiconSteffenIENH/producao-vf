import { describe, expect, it } from 'vitest'
import { avaliarExclusao, type LoteParaExcluir } from '../../src/lib/exclusao-lote'

const lote = (partes: Partial<LoteParaExcluir> = {}): LoteParaExcluir => ({
  codigo: 'L-0031',
  movimentos: 1,
  divisoes: [],
  fornadas: [],
  encomenda: null,
  ...partes,
})

describe('avaliarExclusao', () => {
  it('deixa apagar lote recém-aberto, sem nenhum aviso', () => {
    const r = avaliarExclusao(lote())
    expect(r.pode).toBe(true)
    expect(r.impedimento).toBeNull()
    expect(r.avisos).toEqual([])
    expect(r.soltarEncomenda).toBe(false)
  })

  it('não bloqueia lote que já andou — só avisa o que some junto', () => {
    // a escolha foi deixar apagar qualquer lote; o papel do aviso é a pessoa
    // ver o tamanho do estrago ANTES, não ser impedida
    const r = avaliarExclusao(lote({ movimentos: 7 }))
    expect(r.pode).toBe(true)
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0]).toContain('7 movimentos')
  })

  it('não avisa por movimento quando só existe a abertura', () => {
    // 1 movimento é a própria abertura: dizer "1 movimento some junto" é ruído
    expect(avaliarExclusao(lote({ movimentos: 1 })).avisos).toEqual([])
  })

  describe('lote que deu origem a outro', () => {
    it('bloqueia, porque o filho ficaria apontando para o nada', () => {
      const r = avaliarExclusao(lote({ divisoes: [{ codigo: 'L-0032' }] }))
      expect(r.pode).toBe(false)
      expect(r.impedimento).toContain('L-0032')
      expect(r.impedimento).toContain('nasceu')
      expect(r.impedimento).toContain('lote-filho')
    })

    it('diz todos os filhos, no plural certo', () => {
      const r = avaliarExclusao(lote({ divisoes: [{ codigo: 'L-0032' }, { codigo: 'L-0033' }] }))
      expect(r.impedimento).toContain('L-0032 e L-0033')
      expect(r.impedimento).toContain('nasceram')
      expect(r.impedimento).toContain('lotes-filhos')
    })

    it('bloqueio ganha de qualquer aviso — não mistura as duas conversas', () => {
      const r = avaliarExclusao(
        lote({ divisoes: [{ codigo: 'L-0032' }], movimentos: 9, fornadas: [{ codigo: 'Q-0007', status: 'concluida' }] }),
      )
      expect(r.pode).toBe(false)
      expect(r.avisos).toEqual([])
    })
  })

  describe('fornada', () => {
    it('avisa que a fornada passa a mostrar menos peças', () => {
      const r = avaliarExclusao(lote({ fornadas: [{ codigo: 'Q-0007', status: 'concluida' }] }))
      expect(r.pode).toBe(true)
      expect(r.avisos[0]).toContain('Q-0007')
      expect(r.avisos[0]).toContain('concluida')
    })

    it('um aviso por fornada — o lote pode ter entrado em mais de uma', () => {
      const r = avaliarExclusao(
        lote({ fornadas: [{ codigo: 'Q-0006', status: 'concluida' }, { codigo: 'Q-0007', status: 'queimando' }] }),
      )
      expect(r.avisos).toHaveLength(2)
    })
  })

  describe('encomenda', () => {
    it('solta a encomenda quando era o último lote dela', () => {
      const r = avaliarExclusao(lote({ encomenda: { codigo: 'E-0003', outrosLotes: 0 } }))
      expect(r.soltarEncomenda).toBe(true)
      expect(r.avisos[0]).toContain('E-0003')
      expect(r.avisos[0]).toContain('aberta')
    })

    it('não mexe na encomenda quando ainda sobra outro lote', () => {
      const r = avaliarExclusao(lote({ encomenda: { codigo: 'E-0003', outrosLotes: 2 } }))
      expect(r.soltarEncomenda).toBe(false)
      expect(r.avisos).toEqual([])
    })
  })

  it('junta os avisos quando tudo acontece de uma vez', () => {
    const r = avaliarExclusao(
      lote({
        movimentos: 4,
        fornadas: [{ codigo: 'Q-0007', status: 'concluida' }],
        encomenda: { codigo: 'E-0003', outrosLotes: 0 },
      }),
    )
    expect(r.pode).toBe(true)
    expect(r.avisos).toHaveLength(3)
    expect(r.soltarEncomenda).toBe(true)
  })
})
