import { expect, test } from '../fixtures/teste'
import { nomeUnico } from '../fixtures/dados'
import { PaginaProducao } from '../pages/Producao.page'

/*
 * BDD-1 · UC-01 · Movimentar lote entre etapas
 * SENDO uma pessoa da equipe de produção
 * POSSO mover parte de um lote para a etapa seguinte
 * PARA registrar o que foi produzido sem parar o trabalho
 */
test.describe('BDD-1 Movimentar lote entre etapas', () => {
  test('Movimentação parcial', async ({ page, api }) => {
    // Dado que o lote tem 40 peças na etapa Secagem
    const peca = await api.criarPeca(nomeUnico('TIGELA'))
    const lote = await api.criarLote(peca.id, 40)
    await api.levarAte(lote, peca, 'Secagem')

    // Quando eu movo 25 peças para a 1ª Queima
    const quadro = new PaginaProducao(page)
    await quadro.abrir()
    await quadro.abrirMover(lote.codigo)
    await quadro.preencherMover({ para: '1ª Queima', quantidade: 25 })
    await quadro.confirmar()
    await quadro.esperarMensagem('Movido.')

    // Então a Secagem fica com 15 peças E a 1ª Queima fica com 25 peças
    await expect(quadro.quantidadeDoCartao(quadro.cartaoEm('Secagem', lote.codigo))).toHaveText('15')
    await expect(quadro.quantidadeDoCartao(quadro.cartaoEm('1ª Queima', lote.codigo))).toHaveText('25')

    // E o histórico registra os dois lançamentos (Oleiro→Secagem no preparo, Secagem→1ª Queima agora)
    const detalhe = await api.lote(lote.id)
    const daQueima = detalhe.movimentos.filter((m) => m.etapaDestino?.nome === '1ª Queima')
    expect(daQueima).toHaveLength(1)
    expect(daQueima[0].quantidade).toBe(25)
    expect(daQueima[0].etapaOrigem?.nome).toBe('Secagem')
  })

  test('Quantidade maior que o saldo', async ({ page, api }) => {
    // Dado que o lote tem 15 peças na Secagem
    const peca = await api.criarPeca(nomeUnico('TIGELA'))
    const lote = await api.criarLote(peca.id, 15)
    await api.levarAte(lote, peca, 'Secagem')

    // Quando eu tento mover 20 peças
    const quadro = new PaginaProducao(page)
    await quadro.abrir()
    await quadro.abrirMover(lote.codigo)
    await quadro.preencherMover({ para: '1ª Queima', quantidade: 20 })
    await quadro.confirmar()

    // Então o sistema recusa a operação E informa que há 15 peças disponíveis
    await quadro.esperarMensagem(/15/)
    await expect(quadro.janela(`Mover ${lote.codigo}`)).toBeVisible()
    await expect(quadro.quantidadeDoCartao(quadro.cartaoEm('Secagem', lote.codigo))).toHaveText('15')
  })

  test('Sem conexão', async ({ page, api, context }) => {
    const peca = await api.criarPeca(nomeUnico('TIGELA'))
    const lote = await api.criarLote(peca.id, 30)
    await api.levarAte(lote, peca, 'Secagem')

    const quadro = new PaginaProducao(page)
    await quadro.abrir()
    await quadro.abrirMover(lote.codigo)
    await quadro.preencherMover({ para: '1ª Queima', quantidade: 10 })

    // Dado que estou sem rede no ateliê
    await context.setOffline(true)
    // Quando eu confirmo a movimentação
    await quadro.confirmar()
    // Então a tela confirma o registro
    await quadro.esperarMensagem(/Sem conexão/)

    // E o envio acontece sozinho quando a rede voltar
    await context.setOffline(false)
    // a emulação de rede do Playwright não dispara o evento `online` na página;
    // o navegador de verdade dispara, e é ele que acorda a fila (senão ela
    // esperaria o próximo ciclo de 30 s)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(() => api.saldoEm(lote.id, '1ª Queima'), { timeout: 45_000 }).toBe(10)

    // E o mesmo movimento não é gravado duas vezes: a fila reenvia com a mesma chave
    await quadro.abrir()
    await expect(quadro.quantidadeDoCartao(quadro.cartaoEm('1ª Queima', lote.codigo))).toHaveText('10')
    await expect(quadro.quantidadeDoCartao(quadro.cartaoEm('Secagem', lote.codigo))).toHaveText('20')
    const detalhe = await api.lote(lote.id)
    expect(detalhe.movimentos.filter((m) => m.etapaDestino?.nome === '1ª Queima')).toHaveLength(1)
    expect(await api.saldoEm(lote.id, 'Secagem')).toBe(20)
  })
})
