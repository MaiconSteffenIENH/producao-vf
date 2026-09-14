import { expect, test } from '../fixtures/teste'
import { nomeUnico } from '../fixtures/dados'
import { PaginaProducao } from '../pages/Producao.page'
import { PaginaEtapas } from '../pages/Etapas.page'

/*
 * BDD-6 · UC-05 · Esmaltar parte do lote
 * SENDO uma pessoa do acabamento
 * POSSO esmaltar parte de um lote em biscoito
 * PARA atender a cor que saiu na frente sem comprometer o restante
 */
test.describe('BDD-6 Esmaltar parte do lote', () => {
  test('Divisão ao esmaltar', async ({ page, api }) => {
    // Dado que o lote tem 40 peças em Biscoito sem cor
    const peca = await api.criarPeca(nomeUnico('BOWL'))
    const lote = await api.criarLote(peca.id, 40)
    await api.levarAte(lote, peca, 'Biscoito')

    // Quando eu movo 20 para Esmaltação escolhendo Pistache
    const quadro = new PaginaProducao(page)
    await quadro.abrir()
    await quadro.abrirMover(lote.codigo)
    await quadro.preencherMover({ para: 'Esmaltação', quantidade: 20, esmalte: 'Pistache' })
    await quadro.confirmar()
    await quadro.esperarMensagem(/Parte do lote virou (L-\d+) com a cor escolhida/)

    // Então nasce um lote novo com 20 peças Pistache em Esmaltação (o cartão diz de onde veio)
    const filho = quadro.coluna('Esmaltação').locator('article').filter({ hasText: `veio do ${lote.codigo}` })
    await expect(filho).toBeVisible()
    await expect(quadro.quantidadeDoCartao(filho)).toHaveText('20')
    await expect(filho).toContainText('Pistache')
    // E o lote original continua com 20 peças sem cor em Biscoito
    const pai = quadro.cartaoEm('Biscoito', lote.codigo)
    await expect(quadro.quantidadeDoCartao(pai)).toHaveText('20')
    await expect(pai).toContainText('sem cor definida')
  })

  test('Lote inteiro recebe a cor', async ({ page, api }) => {
    // Dado que o lote tem 15 peças em Biscoito
    const peca = await api.criarPeca(nomeUnico('BOWL'))
    const lote = await api.criarLote(peca.id, 15)
    await api.levarAte(lote, peca, 'Biscoito')

    // Quando eu movo as 15 para Esmaltação escolhendo Coral
    const quadro = new PaginaProducao(page)
    await quadro.abrir()
    await quadro.abrirMover(lote.codigo)
    await quadro.preencherMover({ para: 'Esmaltação', quantidade: 15, esmalte: 'Coral' })
    await quadro.confirmar()
    await quadro.esperarMensagem(/^Movido\.$/)

    // Então o próprio lote fica com a cor Coral E nenhum lote filho é criado
    const cartao = quadro.cartaoEm('Esmaltação', lote.codigo)
    await expect(cartao).toContainText('Coral')
    await expect(quadro.quantidadeDoCartao(cartao)).toHaveText('15')
    await expect(quadro.page.locator('article').filter({ hasText: `veio do ${lote.codigo}` })).toHaveCount(0)
    expect((await api.lote(lote.id)).corId).toBe((await api.cor('Coral')).id)
  })

  test('Só uma etapa define a cor', async ({ page, api }) => {
    // Dado que a etapa Esmaltação já define a cor
    expect((await api.etapa('Esmaltação')).defineCor).toBe(true)
    // Quando o administrador tenta marcar Decoração como etapa que define cor
    const etapas = new PaginaEtapas(page)
    await etapas.abrir()
    await etapas.novaEtapa({ nome: nomeUnico('DECORAÇÃO'), defineCor: true })
    // Então o sistema recusa E explica que outra etapa já define a cor (o lote trocaria de cor no meio do caminho)
    await etapas.esperarMensagem(/já é a que define a cor/)
    expect((await api.etapas()).filter((e) => e.defineCor)).toHaveLength(1)
  })
})
