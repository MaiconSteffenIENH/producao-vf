import { describe, expect, it } from 'vitest'
import { comAuth } from './helpers'

/**
 * Garante que toda tela abre. Endpoint GET novo entra aqui — é a bateria
 * mais barata que impede uma tela de nascer quebrada em produção.
 */
const GETS = [
  '/me',
  '/dashboard/resumo',
  '/pecas',
  '/pecas?busca=xicara',
  '/pecas?ativo=true',
  '/categorias',
  '/cores',
  '/responsaveis',
  '/etapas',
  '/materias-primas',
  '/papeis',
  '/modulos',
  '/usuarios',
  '/lotes',
  '/lotes/kanban',
  '/lotes?situacao=andamento',
  '/planejamento',
  '/estoque/biscoito',
  '/estoque/prontas',
  '/agenda',
  '/precos',
  '/canais',
]

describe('smoke — todos os GET respondem', () => {
  it.each(GETS)('GET %s', async (caminho) => {
    const r = await comAuth('get', caminho)
    expect(r.status, `${caminho} devolveu ${r.status}: ${JSON.stringify(r.body)}`).toBe(200)
  })

  it('/health responde sem token', async () => {
    const r = await comAuth('get', '/health')
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
  })
})

describe('GET com :id — não cabem na lista de caminhos fixos', () => {
  it('/pecas/:id/nome-de-copia sugere um nome livre', async () => {
    const lista = await comAuth('get', '/pecas')
    const peca = lista.body[0] as { id: string; nome: string }
    const r = await comAuth('get', `/pecas/${peca.id}/nome-de-copia`)
    expect(r.status).toBe(200)
    expect(r.body.nome).toMatch(/\(CÓPIA( \d+)?\)$/)
    // o sugerido tem que estar livre, senão o modal abre com um nome que o
    // próprio salvar vai recusar por unicidade
    expect(r.body.nome).not.toBe(peca.nome)
  })

  it('/lotes/ordem-producao monta a folha da bancada', async () => {
    const lotes = await comAuth('get', '/lotes')
    const lote = lotes.body[0] as { id: string; codigo: string }
    const r = await comAuth('get', `/lotes/ordem-producao?ids=${lote.id}`)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.itens).toHaveLength(1)
    expect(r.body.itens[0].codigo).toBe(lote.codigo)
    expect(r.body.itens[0].quantidade).toBeGreaterThan(0)
  })

  it('/lotes/ordem-producao não é confundido com /lotes/:id', async () => {
    // as duas rotas têm dois segmentos; se a literal perder a precedência,
    // "ordem-producao" vira um id e a resposta vira 404 sem explicação
    const r = await comAuth('get', '/lotes/ordem-producao?ids=')
    expect(r.status).toBe(422)
  })

  it('não confunde o :id de duas partes com o de três', async () => {
    // /pecas/:id e /pecas/:id/nome-de-copia moram no mesmo prefixo; se a ordem
    // das rotas mudar, esta some sem ninguém perceber
    const lista = await comAuth('get', '/pecas')
    const r = await comAuth('get', `/pecas/${lista.body[0].id}`)
    expect(r.status).toBe(200)
    expect(r.body.roteiro).toBeDefined()
  })
})

describe('busca acento-insensível', () => {
  it('acha "Xícara" digitando sem acento', async () => {
    const r = await comAuth('get', '/pecas?busca=xicara')
    expect(r.status).toBe(200)
    expect(r.body.length).toBeGreaterThan(0)
    expect(r.body.every((p: { nome: string }) => p.nome.toLowerCase().includes('xícara'))).toBe(true)
  })
})
