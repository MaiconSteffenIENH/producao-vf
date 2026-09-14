import { expect, test } from '../fixtures/teste'
import { diaDoAtelie, nomeNoPlural, nomeUnico } from '../fixtures/dados'
import { PaginaEncomendas } from '../pages/Encomendas.page'
import { PaginaPlanejamento } from '../pages/Planejamento.page'

/*
 * BDD-9 · UC-09 · Registrar encomenda com prazo
 * SENDO a auxiliar administrativa
 * POSSO registrar uma encomenda com prazo
 * PARA saber na hora se a data é cumprível e não prometer o que não dá
 */
test.describe('BDD-9 Registrar encomenda com prazo', () => {
  /** roteiro sem forno: 10 + 8 dias = piso 18, teto 18 × 1,35 = 25 */
  const roteiroRapido = ['Oleiro', 'Secagem', 'Pronto']

  test('Prazo cabe', async ({ page, api }) => {
    // Dado que a peça leva de 18 a 25 dias para ficar pronta
    const peca = await api.criarPeca(nomeUnico('XÍCARA RETA'), { roteiro: roteiroRapido })
    await api.put(`/pecas/${peca.id}`, { ...peca, roteiro: [
      { etapaId: peca.roteiro[0].etapaId, ordem: 1, diasEstimados: 10 },
      { etapaId: peca.roteiro[1].etapaId, ordem: 2, diasEstimados: 8 },
      { etapaId: peca.roteiro[2].etapaId, ordem: 3, diasEstimados: 0 },
    ], cores: peca.cores.map((c) => ({ corId: c.corId, qtdMinimaDesejada: 0 })), insumos: [] })

    // Quando eu registro uma encomenda de 20 xícaras para daqui a 30 dias
    const encomendas = new PaginaEncomendas(page)
    await encomendas.abrir()
    const cliente = nomeUnico('RESTAURANTE')
    await encomendas.novaEncomenda({ cliente, entregarAte: diaDoAtelie(30), itens: [{ peca: peca.nome, quantidade: 20 }] })
    await encomendas.esperarMensagem('Encomenda registrada.')

    // Então o sistema indica que o prazo cabe
    const cartao = encomendas.cartao(cliente)
    await expect(cartao).toContainText('produzir leva entre 18 e 25 dias')
    await expect(cartao).not.toContainText('prazo apertado')
    // E a encomenda entra no planejamento antes da reposição
    const plano = new PaginaPlanejamento(page)
    await plano.abrir()
    const primeira = plano.page.locator('div.rounded-2xl').filter({ has: plano.page.getByRole('heading', { level: 2 }) }).first()
    await expect(primeira).toContainText(new RegExp(`^Encomenda E-\\d+: 20 ${nomeNoPlural(peca.nome)}`))
  })

  test('Prazo não cabe', async ({ page, api }) => {
    const peca = await api.criarPeca(nomeUnico('XÍCARA RETA'), { roteiro: roteiroRapido })
    await api.put(`/pecas/${peca.id}`, { ...peca, roteiro: [
      { etapaId: peca.roteiro[0].etapaId, ordem: 1, diasEstimados: 10 },
      { etapaId: peca.roteiro[1].etapaId, ordem: 2, diasEstimados: 8 },
      { etapaId: peca.roteiro[2].etapaId, ordem: 3, diasEstimados: 0 },
    ], cores: peca.cores.map((c) => ({ corId: c.corId, qtdMinimaDesejada: 0 })), insumos: [] })

    // Quando eu registro uma encomenda para daqui a 20 dias
    const encomendas = new PaginaEncomendas(page)
    await encomendas.abrir()
    const cliente = nomeUnico('RESTAURANTE')
    await encomendas.novaEncomenda({ cliente, entregarAte: diaDoAtelie(20), itens: [{ peca: peca.nome, quantidade: 20 }] })
    await encomendas.esperarMensagem('Encomenda registrada.')

    // Então o sistema avisa em vermelho que pela previsão não dá E mostra que a conta usou os 25 dias, não os 18
    const cartao = encomendas.cartao(cliente)
    await expect(cartao).toContainText('prazo apertado')
    await expect(cartao).toContainText('entre 18 e 25 dias')
    await expect(encomendas.page.getByText(/não dá para entregar na data combinada/)).toBeVisible()
  })

  test('Peça mais demorada manda', async ({ page, api }) => {
    // Dado que a encomenda tem uma peça de 10 a 14 dias e outra de 20 a 27 dias
    const rapida = await api.criarPeca(nomeUnico('BOWL'), { roteiro: roteiroRapido })
    await api.put(`/pecas/${rapida.id}`, { ...rapida, roteiro: [
      { etapaId: rapida.roteiro[0].etapaId, ordem: 1, diasEstimados: 6 },
      { etapaId: rapida.roteiro[1].etapaId, ordem: 2, diasEstimados: 4 },
      { etapaId: rapida.roteiro[2].etapaId, ordem: 3, diasEstimados: 0 },
    ], cores: rapida.cores.map((c) => ({ corId: c.corId, qtdMinimaDesejada: 0 })), insumos: [] })
    const lenta = await api.criarPeca(nomeUnico('BULE'), { roteiro: roteiroRapido })
    await api.put(`/pecas/${lenta.id}`, { ...lenta, roteiro: [
      { etapaId: lenta.roteiro[0].etapaId, ordem: 1, diasEstimados: 12 },
      { etapaId: lenta.roteiro[1].etapaId, ordem: 2, diasEstimados: 8 },
      { etapaId: lenta.roteiro[2].etapaId, ordem: 3, diasEstimados: 0 },
    ], cores: lenta.cores.map((c) => ({ corId: c.corId, qtdMinimaDesejada: 0 })), insumos: [] })

    // Quando o prazo for conferido
    const encomendas = new PaginaEncomendas(page)
    await encomendas.abrir()
    const cliente = nomeUnico('LOJA')
    await encomendas.novaEncomenda({ cliente, entregarAte: diaDoAtelie(40), itens: [{ peca: rapida.nome, quantidade: 5 }, { peca: lenta.nome, quantidade: 5 }] })
    await encomendas.esperarMensagem('Encomenda registrada.')

    // Então a previsão usada é a da peça mais lenta
    await expect(encomendas.cartao(cliente)).toContainText('produzir leva entre 20 e 27 dias')
  })
})
