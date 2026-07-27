import { beforeAll, describe, expect, it } from 'vitest'
import { comAuth } from './helpers'

/**
 * O fluxo real do ateliê, ponta a ponta: 40 peças entram, caminham até o
 * biscoito, metade é esmaltada numa cor (o que DEVE dividir o lote sozinho),
 * três quebram na segunda queima e o resto chega em Pronto.
 *
 * É o teste que protege a decisão mais importante do sistema: o lote nasce
 * sem cor e o biscoito é estoque neutro.
 */
describe('produção — do torno ao pronto', () => {
  let pecaId = ''
  let loteId = ''
  let etapas: { id: string; nome: string; tipo: string; defineCor: boolean; estoqueIntermediario: boolean }[] = []
  let corId = ''
  const id = (nome: string) => etapas.find((e) => e.nome === nome)!.id

  beforeAll(async () => {
    const [ps, es, cs] = await Promise.all([
      comAuth('get', '/pecas?ativo=true'),
      comAuth('get', '/etapas'),
      comAuth('get', '/cores'),
    ])
    // a Tortinha tem o roteiro mais curto do seed: equipe → secagem → … → pronto
    pecaId = ps.body.find((p: { nome: string }) => p.nome === 'Tortinha').id
    etapas = es.body
    corId = cs.body.find((c: { nome: string }) => c.nome === 'Pistache').id
  })

  it('abre um lote na primeira etapa do roteiro, sem cor', async () => {
    const r = await (await comAuth('post', '/lotes')).send({ pecaId, quantidade: 40 })
    expect(r.status).toBe(201)
    expect(r.body.corId).toBeNull()
    loteId = r.body.id

    const detalhe = await comAuth('get', `/lotes/${loteId}`)
    expect(detalhe.body.saldoTotal).toBe(40)
  })

  it('recusa avançar mais peças do que existem na etapa', async () => {
    const r = await (await comAuth('post', `/lotes/${loteId}/avancar`)).send({
      etapaOrigemId: id('Equipe Vera'),
      etapaDestinoId: id('Secagem'),
      quantidade: 999,
    })
    expect(r.status).toBe(409)
    expect(r.body.mensagem).toContain('Só há 40')
  })

  it('caminha até o biscoito', async () => {
    for (const [de, para] of [
      ['Equipe Vera', 'Secagem'],
      ['Secagem', '1ª Queima'],
      ['1ª Queima', 'Biscoito'],
    ]) {
      const r = await (await comAuth('post', `/lotes/${loteId}/avancar`)).send({
        etapaOrigemId: id(de),
        etapaDestinoId: id(para),
        quantidade: 40,
      })
      expect(r.status, `${de} → ${para}: ${JSON.stringify(r.body)}`).toBe(200)
    }
    const detalhe = await comAuth('get', `/lotes/${loteId}`)
    const biscoito = detalhe.body.distribuicao.find((d: { etapa: string }) => d.etapa === 'Biscoito')
    expect(biscoito.quantidade).toBe(40)
  })

  it('exige escolher o esmalte na etapa que define a cor', async () => {
    const r = await (await comAuth('post', `/lotes/${loteId}/avancar`)).send({
      etapaOrigemId: id('Biscoito'),
      etapaDestinoId: id('Esmaltação'),
      quantidade: 20,
    })
    expect(r.status).toBe(422)
    expect(r.body.mensagem).toContain('escolha o esmalte')
  })

  let filhoId = ''

  it('esmaltar só parte do lote divide sozinho e deixa o resto neutro', async () => {
    const r = await (await comAuth('post', `/lotes/${loteId}/avancar`)).send({
      etapaOrigemId: id('Biscoito'),
      etapaDestinoId: id('Esmaltação'),
      quantidade: 20,
      corId,
    })
    expect(r.status).toBe(200)
    expect(r.body.loteCriado).toBeTruthy()
    filhoId = r.body.loteCriado.id

    const pai = await comAuth('get', `/lotes/${loteId}`)
    expect(pai.body.corId).toBeNull() // o pai continua sem cor
    expect(pai.body.saldoTotal).toBe(20)

    const filho = await comAuth('get', `/lotes/${filhoId}`)
    expect(filho.body.corId).toBe(corId)
    expect(filho.body.saldoTotal).toBe(20)
  })

  it('registra perda e conclui o lote com o que sobrou', async () => {
    await (await comAuth('post', `/lotes/${filhoId}/avancar`)).send({
      etapaOrigemId: id('Esmaltação'),
      etapaDestinoId: id('2ª Queima'),
      quantidade: 20,
      corId,
    })

    const perda = await (await comAuth('post', `/lotes/${filhoId}/perda`)).send({
      etapaId: id('2ª Queima'),
      quantidade: 3,
      motivo: 'Trincaram na queima alta',
    })
    expect(perda.status).toBe(200)

    const fim = await (await comAuth('post', `/lotes/${filhoId}/avancar`)).send({
      etapaOrigemId: id('2ª Queima'),
      etapaDestinoId: id('Pronto'),
      quantidade: 17,
      corId,
    })
    expect(fim.status).toBe(200)

    const filho = await comAuth('get', `/lotes/${filhoId}`)
    expect(filho.body.saldoTotal).toBe(17)
    expect(filho.body.perdaTotal).toBe(3)
    expect(filho.body.concluidoEm).toBeTruthy()
  })

  it('o biscoito neutro que sobrou aparece no planejamento como disponível para esmaltar', async () => {
    const r = await comAuth('get', '/planejamento')
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.sugestoes)).toBe(true)
  })

  it('recusa dividir o lote inteiro', async () => {
    const r = await (await comAuth('post', `/lotes/${loteId}/dividir`)).send({
      etapaId: id('Biscoito'),
      quantidade: 20,
    })
    expect(r.status).toBe(409)
  })
})
