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

describe('busca acento-insensível', () => {
  it('acha "Xícara" digitando sem acento', async () => {
    const r = await comAuth('get', '/pecas?busca=xicara')
    expect(r.status).toBe(200)
    expect(r.body.length).toBeGreaterThan(0)
    expect(r.body.every((p: { nome: string }) => p.nome.toLowerCase().includes('xícara'))).toBe(true)
  })
})
