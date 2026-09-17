import { expect, test } from '../fixtures/teste'
import { diaDoAtelie, nomeUnico } from '../fixtures/dados'
import { PaginaProducao } from '../pages/Producao.page'
import { PaginaInicio } from '../pages/Inicio.page'

/*
 * BDD-14 · UC-01 · Lote parado além do previsto
 * SENDO uma pessoa da equipe de produção
 * POSSO ver no cartão há quantos dias o lote está na etapa, contra o previsto do roteiro
 * PARA saber se a peça já andou e ninguém moveu o cartão, ou se ela está parada mesmo
 *
 * O roteiro padrão dos testes prevê 1 dia no Oleiro e 5 na Secagem.
 */
test.describe('BDD-14 Lote parado além do previsto', () => {
  test('Cartão avisa o atraso', async ({ page, api }) => {
    // Dado que um lote entrou no Oleiro há 3 dias, e o roteiro prevê 1 dia ali
    const peca = await api.criarPeca(nomeUnico('TIGELA'))
    const lote = await api.criarLote(peca.id, 12, { iniciadoEm: diaDoAtelie(-3) })

    // Quando eu abro o quadro
    const quadro = new PaginaProducao(page)
    await quadro.abrir()

    // Então o cartão diz que está 2 dias além do previsto, em destaque
    const cartao = quadro.cartaoEm('Oleiro', lote.codigo)
    await expect(cartao.locator('[data-situacao="atrasado"]')).toHaveText('2 dias além do previsto (1)')

    // E o Início lista o lote entre os parados além do previsto
    const inicio = new PaginaInicio(page)
    await inicio.abrir()
    const parados = page.locator('[data-lotes-parados]')
    await expect(parados.getByText(lote.codigo)).toBeVisible()
    await expect(parados.locator('li').filter({ hasText: lote.codigo })).toContainText('12 peças em Oleiro')
  })

  test('Mover o cartão zera a contagem', async ({ page, api }) => {
    // Dado que um lote entrou no Oleiro há 3 dias
    const peca = await api.criarPeca(nomeUnico('TIGELA'))
    const lote = await api.criarLote(peca.id, 12, { iniciadoEm: diaDoAtelie(-3) })

    // Quando eu movo o lote para a Secagem hoje
    const quadro = new PaginaProducao(page)
    await quadro.abrir()
    await quadro.abrirMover(lote.codigo)
    await quadro.preencherMover({ para: 'Secagem', quantidade: 12 })
    await quadro.confirmar()
    await quadro.esperarMensagem('Movido.')

    // Então o cartão na Secagem conta do zero, contra os 5 dias previstos
    const cartao = quadro.cartaoEm('Secagem', lote.codigo)
    await expect(cartao.locator('[data-situacao="no_prazo"]')).toHaveText('entrou hoje, previsto 5 dias')

    // E o lote some da lista de parados do Início
    const inicio = new PaginaInicio(page)
    await inicio.abrir()
    await expect(page.locator('[data-lotes-parados]').getByText(lote.codigo)).toHaveCount(0)
  })
})
