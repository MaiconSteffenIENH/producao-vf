import { describe, expect, it } from 'vitest'
import { avaliarAcesso, enumerar } from '../../src/lib/guarda-modulos'

/*
 * O modo de falha caro aqui é o FALSO BLOQUEIO. Ele não avisa: a tela para de
 * funcionar e ninguém liga o defeito à caixinha desmarcada três dias antes.
 * Por isso a maior parte destes casos confere que algo PASSA.
 */

const SEM_RESTRICAO = null
const so = (...chaves: string[]) => ({ modulos: chaves })

describe('as portas que nunca fecham', () => {
  for (const rota of ['/auth/login', '/me', '/health', '/ajustes/senha']) {
    it(`${rota} passa mesmo com tudo desligado e papel sem nada`, () => {
      expect(avaliarAcesso(rota, ['ajustes', 'inicio', 'producao'], so(), false).passa).toBe(true)
    })
  }

  it('sem estas portas, engano de configuração não teria conserto pela tela', () => {
    // é o caso concreto: alguém restringiu o papel a nada e ainda assim
    // precisa conseguir entrar e trocar a senha
    expect(avaliarAcesso('/me', [], so(), false).passa).toBe(true)
    expect(avaliarAcesso('/ajustes', [], so(), false).passa).toBe(true)
  })
})

describe('prefixo fora do mapa', () => {
  it('passa — rota nova não pode nascer bloqueada', () => {
    expect(avaliarAcesso('/dashboard/resumo', [], so(), false).passa).toBe(true)
    expect(avaliarAcesso('/inventado', [], so(), false).passa).toBe(true)
  })

  it('caminho vazio passa', () => {
    expect(avaliarAcesso('/', [], so(), false).passa).toBe(true)
    expect(avaliarAcesso('', [], so(), false).passa).toBe(true)
  })
})

describe('rota compartilhada — o defeito que o revisor achou', () => {
  it('desligar o cadastro de Esmaltes NÃO derruba o quadro de produção', () => {
    // /cores alimenta o chip do lote no quadro. Mapeado 1-para-1, desligar
    // "Esmaltes" barraria /cores e quebraria uma tela ESSENCIAL.
    expect(avaliarAcesso('/cores', ['esmaltes'], SEM_RESTRICAO, false).passa).toBe(true)
  })

  it('desligar Etapas não derruba o quadro nem o forno', () => {
    expect(avaliarAcesso('/etapas', ['etapas'], SEM_RESTRICAO, false).passa).toBe(true)
  })

  it('desligar Categorias não derruba o cadastro de peças', () => {
    expect(avaliarAcesso('/categorias', ['categorias'], SEM_RESTRICAO, false).passa).toBe(true)
  })

  it('quem só tem o Histórico continua lendo /lotes', () => {
    expect(avaliarAcesso('/lotes', [], so('historico'), false).passa).toBe(true)
  })

  it('LER /cores passa para qualquer um — o quadro, que é essencial, precisa do chip', () => {
    expect(avaliarAcesso('/cores', [], so('precos'), false).passa).toBe(true)
  })

  it('mas ESCREVER em /cores exige o dono da rota, o cadastro de Esmaltes', () => {
    // sem esta separação, quem foi restrito a "Tarefas do dia" continuaria
    // podendo apagar um esmalte por baixo, porque o quadro também lê /cores
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const v = avaliarAcesso('/cores/abc', [], so('meu-dia'), false, metodo)
      expect(v.passa, `${metodo} deveria ser barrado`).toBe(false)
    }
    expect(avaliarAcesso('/cores/abc', [], so('esmaltes'), false, 'DELETE').passa).toBe(true)
  })

  it('quem tem o cadastro escreve nele normalmente', () => {
    expect(avaliarAcesso('/etapas/abc', [], so('etapas'), false, 'PUT').passa).toBe(true)
  })

  it('a ordem por arrasto é escrita, e também respeita o dono', () => {
    expect(avaliarAcesso('/etapas/ordem', [], so('producao'), false, 'PUT').passa).toBe(false)
    expect(avaliarAcesso('/etapas/ordem', [], so('etapas'), false, 'PUT').passa).toBe(true)
  })
})

describe('a administração dos próprios módulos está no mapa', () => {
  it('/modulos e /papeis não ficam de fora — seria a única rota sem tranca', () => {
    expect(avaliarAcesso('/papeis/abc/modulos', [], so('forno'), false).passa).toBe(false)
  })
})

describe('as duas conversas diferentes', () => {
  it('quando o ateliê desligou, a mensagem manda religar em Ajustes', () => {
    const v = avaliarAcesso('/queimas/fila', ['forno'], SEM_RESTRICAO, true)
    expect(v.passa).toBe(false)
    if (!v.passa) {
      expect(v.motivo).toBe('desligado')
      expect(v.mensagem).toContain('o ateliê desligou')
      expect(v.mensagem).toContain('nada foi apagado')
    }
  })

  it('quando é o papel, a mensagem manda pedir a quem administra', () => {
    const v = avaliarAcesso('/queimas/fila', [], so('fotos'), false)
    expect(v.passa).toBe(false)
    if (!v.passa) {
      expect(v.motivo).toBe('sem_acesso')
      expect(v.mensagem).toContain('quem administra')
    }
  })

  it('mandar falar com o admin quando o problema é a chave desligada faria procurar no lugar errado', () => {
    const v = avaliarAcesso('/queimas/fila', ['forno'], so('forno'), false)
    expect(v.passa).toBe(false)
    if (!v.passa) expect(v.motivo).toBe('desligado')
  })
})

describe('desligado vale até para administrador', () => {
  it('admin não fura a configuração do ateliê', () => {
    expect(avaliarAcesso('/vendas/comparativo', ['vendas'], SEM_RESTRICAO, true).passa).toBe(false)
  })
})

describe('caixa alta na URL', () => {
  it('/QUEIMAS não entra por uma porta que /queimas tem fechada', () => {
    expect(avaliarAcesso('/QUEIMAS/fila', ['forno'], SEM_RESTRICAO, true).passa).toBe(false)
  })
})

describe('enumerar', () => {
  it('usa o rótulo do módulo, não a chave', () => {
    expect(enumerar(['forno'])).toBe('Forno')
  })
  it('junta dois com "ou"', () => {
    expect(enumerar(['estoque-biscoito', 'estoque-prontas'])).toBe('Estoque de biscoito ou Peças prontas')
  })
  it('junta três com vírgula e "ou"', () => {
    expect(enumerar(['forno', 'fotos', 'vendas'])).toContain(', ')
    expect(enumerar(['forno', 'fotos', 'vendas'])).toContain(' ou ')
  })
  it('não quebra com lista vazia', () => {
    expect(enumerar([])).toBe('este módulo')
  })
})
