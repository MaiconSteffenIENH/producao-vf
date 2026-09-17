import { beforeAll, describe, expect, it } from 'vitest'
import { comAuth } from './helpers'

/**
 * A encomenda fica "pronta" sozinha quando todos os lotes dela concluem e o
 * que está nas etapas finais cobre o pedido; volta a "em produção" se um lote
 * reabrir. Mesmo princípio da conclusão do lote: estado derivado, nunca
 * checkbox.
 */
describe('encomenda fica pronta sozinha', () => {
  let pecaId = ''
  let corId = ''
  let etapas: { id: string; nome: string; defineCor: boolean }[] = []
  const id = (nome: string) => etapas.find((e) => e.nome === nome)!.id
  const caminho = ['Equipe Vera', 'Secagem', '1ª Queima', 'Biscoito', 'Esmaltação', '2ª Queima', 'Pronto']

  beforeAll(async () => {
    const [ps, es, cs] = await Promise.all([comAuth('get', '/pecas?ativo=true'), comAuth('get', '/etapas'), comAuth('get', '/cores')])
    pecaId = ps.body.find((p: { nome: string }) => p.nome === 'Tortinha').id
    etapas = es.body
    corId = cs.body.find((c: { nome: string }) => c.nome === 'Pistache').id
  })

  async function mover(loteId: string, de: string, para: string, quantidade: number) {
    const destino = etapas.find((e) => e.nome === para)!
    const r = await comAuth('post', `/lotes/${loteId}/avancar`, {
      etapaOrigemId: id(de),
      etapaDestinoId: destino.id,
      quantidade,
      corId: destino.defineCor ? corId : undefined,
    })
    expect(r.status, `${de} → ${para}: ${JSON.stringify(r.body)}`).toBe(200)
  }

  const statusDa = async (encomendaId: string) => (await comAuth('get', `/encomendas/${encomendaId}`)).body.status as string

  it('aberta → em produção quando o lote nasce → pronta quando tudo chega em Pronto', async () => {
    const enc = await comAuth('post', '/encomendas', {
      cliente: 'LOJA TESTE',
      entregarAte: '2027-01-15',
      itens: [{ pecaId, corId, quantidade: 10 }],
    })
    expect(enc.status).toBe(201)
    expect(await statusDa(enc.body.id)).toBe('aberta')

    const lote = await comAuth('post', '/lotes', { pecaId, quantidade: 10, encomendaId: enc.body.id })
    expect(lote.status).toBe(201)
    expect(await statusDa(enc.body.id)).toBe('em_producao')

    for (let i = 0; i < caminho.length - 2; i++) await mover(lote.body.id, caminho[i], caminho[i + 1], 10)
    // na 2ª Queima ainda não está pronta
    expect(await statusDa(enc.body.id)).toBe('em_producao')

    await mover(lote.body.id, '2ª Queima', 'Pronto', 10)
    expect(await statusDa(enc.body.id)).toBe('pronta')
  })

  it('lote que cobre só parte do pedido não deixa a encomenda pronta', async () => {
    const enc = await comAuth('post', '/encomendas', {
      cliente: 'LOJA TESTE',
      entregarAte: '2027-01-15',
      itens: [{ pecaId, corId, quantidade: 10 }],
    })
    const lote = await comAuth('post', '/lotes', { pecaId, quantidade: 4, encomendaId: enc.body.id })
    for (let i = 0; i < caminho.length - 1; i++) await mover(lote.body.id, caminho[i], caminho[i + 1], 4)
    expect(await statusDa(enc.body.id)).toBe('em_producao')
  })

  it('peça que volta para o meio do caminho reabre a encomenda', async () => {
    const enc = await comAuth('post', '/encomendas', {
      cliente: 'LOJA TESTE',
      entregarAte: '2027-01-15',
      itens: [{ pecaId, corId, quantidade: 6 }],
    })
    const lote = await comAuth('post', '/lotes', { pecaId, quantidade: 6, encomendaId: enc.body.id })
    for (let i = 0; i < caminho.length - 1; i++) await mover(lote.body.id, caminho[i], caminho[i + 1], 6)
    expect(await statusDa(enc.body.id)).toBe('pronta')

    await mover(lote.body.id, 'Pronto', 'Esmaltação', 2)
    expect(await statusDa(enc.body.id)).toBe('em_producao')
  })
})
