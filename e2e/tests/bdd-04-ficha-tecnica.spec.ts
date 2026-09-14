import { expect, test } from '../fixtures/teste'
import { nomeUnico } from '../fixtures/dados'
import { PaginaPecas } from '../pages/Pecas.page'

/*
 * BDD-4 · UC-11 · Manter cadastro de peça (ficha técnica)
 * SENDO a auxiliar administrativa
 * POSSO cadastrar a ficha técnica da peça
 * PARA que a produção siga um padrão em vez de reproduzir de memória
 */
test.describe('BDD-4 Ficha técnica da peça', () => {
  test('Ficha completa', async ({ page, api }) => {
    // Dado que estou no cadastro da peça
    const peca = await api.criarPeca(nomeUnico('XÍCARA RETA'))
    const pecas = new PaginaPecas(page)
    await pecas.abrir()
    await pecas.editar(peca.nome)

    // Quando eu informo 10,5 cm de altura, boca de 9,5 cm, 340 g de barro e tolerância de 5%
    // E escolho que as medidas são da peça crua
    await pecas.preencherFicha({ altura: '10,5', boca: '9,5', pesoCru: '340', tolerancia: '5', momento: 'Peça crua, antes de secar' })
    await pecas.salvar()

    // Então a ficha é salva
    await pecas.esperarMensagem('Peça atualizada.')
    const salva = await api.peca(peca.id)
    expect(Number(salva.alturaCm)).toBe(10.5)
    expect(salva.medidasMomento).toBe('cru')

    // E a ordem de produção passa a mostrar a faixa de 10 a 11 cm
    const lote = await api.criarLote(peca.id, 12)
    await page.goto(`/ordem-producao?lotes=${lote.id}`)
    await expect(page.getByText('10 a 11 cm')).toBeVisible()
    await expect(page.getByText('9 a 10 cm')).toBeVisible()
  })

  test('Medida sem momento', async ({ page, api }) => {
    const peca = await api.criarPeca(nomeUnico('XÍCARA RETA'))
    const pecas = new PaginaPecas(page)
    await pecas.abrir()
    await pecas.editar(peca.nome)
    // Dado que informei 10,5 cm de altura
    await pecas.preencherFicha({ altura: '10,5', momento: '' })
    // Quando eu salvar sem escolher o momento da medição
    await pecas.salvar()
    // Então o sistema recusa E explica que a argila encolhe na queima
    await pecas.esperarMensagem(/encolhe/)
    await expect(pecas.janelaDaPeca).toBeVisible()
    expect((await api.peca(peca.id)).alturaCm).toBeNull()
  })

  test('Peso do cru em ficha da peça pronta', async ({ page, api }) => {
    const peca = await api.criarPeca(nomeUnico('XÍCARA RETA'))
    const pecas = new PaginaPecas(page)
    await pecas.abrir()
    await pecas.editar(peca.nome)
    // Dado que informei 340 g de barro cru
    // Quando eu marcar que as medidas são da peça pronta
    await pecas.preencherFicha({ altura: '10,5', pesoCru: '340', momento: 'Peça pronta, depois da 2ª queima' })
    await pecas.salvar()
    // Então o sistema recusa a combinação
    await pecas.esperarMensagem(/cru/)
    await expect(pecas.janelaDaPeca).toBeVisible()
    expect((await api.peca(peca.id)).pesoCruG).toBeNull()
  })
})
