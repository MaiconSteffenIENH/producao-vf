import { expect, test } from '../fixtures/teste'
import { nomeUnico } from '../fixtures/dados'
import { PaginaVendas } from '../pages/Vendas.page'

/** competência (AAAA-MM) do mês fechado anterior ao atual, no fuso do ateliê */
function mesFechado(meses = 1): string {
  const d = new Date(Date.now() - 3 * 3600 * 1000)
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - meses)
  return d.toISOString().slice(0, 7)
}
const mmaaaa = (competencia: string) => `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`

/*
 * BDD-8 · UC-08 · Importar planilha de vendas
 * SENDO a auxiliar administrativa
 * POSSO importar a planilha de vendas do marketplace
 * PARA saber a velocidade de venda sem digitar linha por linha
 */
test.describe('BDD-8 Importar planilha de vendas', () => {
  test('Importação sem duplicar', async ({ page, api }) => {
    // Dado que a planilha do mês passado já foi importada
    const peca = await api.criarPeca(nomeUnico('BOWL'))
    const csv = `Produto;Cor;Mês;Quantidade\n${peca.nome};Pistache;${mmaaaa(mesFechado())};12`
    const primeira = await api.importarVendas(csv)
    expect(primeira.importadas).toBe(1)

    // Quando eu importo a mesma planilha de novo
    const vendas = new PaginaVendas(page)
    await vendas.abrir()
    await vendas.abrirImportacao()
    await vendas.colarEImportar(csv)

    // Então o sistema informa que não há linha nova E nenhuma venda é gravada em dobro
    await vendas.esperarMensagem(/^0 novas e 1 atualizadas/)
    await expect(vendas.resultadoDaImportacao).toContainText('0 novas, 1 atualizadas')
    const lista = await api.get<{ quantidade: number; pecaId: string }[]>(`/vendas?pecaId=${peca.id}`)
    expect(lista).toHaveLength(1)
    expect(lista[0].quantidade).toBe(12)
  })

  test('Anúncio não reconhecido', async ({ page, api }) => {
    // Dado que a planilha traz um anúncio cujo nome não bate com nenhuma peça cadastrada
    const conhecida = await api.criarPeca(nomeUnico('BOWL'))
    const desconhecido = nomeUnico('CANECA VERDE MUSGO')
    const csv = `Produto;Cor;Mês;Quantidade\n${conhecida.nome};Pistache;${mmaaaa(mesFechado())};3\n${desconhecido};;${mmaaaa(mesFechado())};5`

    // Quando eu importo
    const vendas = new PaginaVendas(page)
    await vendas.abrir()
    await vendas.abrirImportacao()
    await vendas.colarEImportar(csv)

    // Então a linha aparece em destaque como não reconhecida, e só a linha conhecida é gravada
    await expect(vendas.resultadoDaImportacao).toContainText('1 peça(s) não reconhecida(s)')
    await expect(vendas.resultadoDaImportacao).toContainText(desconhecido)
    await expect(vendas.resultadoDaImportacao).toContainText('1 novas')
    // E ela não vira cadastro sozinha: cadastrar a peça e importar de novo é o que resolve
    const pecas = await api.get<{ nome: string }[]>('/pecas')
    expect(pecas.some((p) => p.nome === desconhecido)).toBe(false)
  })

  test('Cobertura em semanas', async ({ page, api }) => {
    // Dado que a peça vendeu ~12 por semana no último mês fechado (52 no mês) E que há 30 prontas
    const peca = await api.criarPeca(nomeUnico('BOWL'))
    const lote = await api.criarLote(peca.id, 30)
    await api.levarAte(lote, peca, 'Pronto', 'Pistache')
    await api.post('/vendas', { pecaId: peca.id, corId: (await api.cor('Pistache')).id, competencia: mesFechado(), quantidade: 52, darBaixa: false })

    // Quando eu abrir a cobertura
    const vendas = new PaginaVendas(page)
    await vendas.abrir()

    // Então o sistema informa 2,5 semanas de estoque (30 ÷ 11,96 por semana)
    const linha = vendas.linhaDaPeca(peca.nome)
    await expect(linha).toContainText('2,5 semanas')
  })
})
