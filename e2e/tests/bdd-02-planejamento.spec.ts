import { expect, test } from '../fixtures/teste'
import { nomeNoPlural, nomeUnico } from '../fixtures/dados'
import { PaginaPlanejamento } from '../pages/Planejamento.page'
import { PaginaInicio } from '../pages/Inicio.page'

/*
 * BDD-2 · UC-02 · Consultar o plano e abrir lote de produção
 * SENDO a proprietária do ateliê
 * POSSO consultar quanto produzir de cada peça
 * PARA não produzir a mais e acumular estoque parado
 */
test.describe('BDD-2 Consultar o plano e abrir lote de produção', () => {
  test('Sugestão com perda embutida', async ({ page, api }) => {
    // Dado que a peça tem mínimo de 60 no cadastro (sem venda em mês fechado) e saldo de 10 peças prontas
    // E que a perda medida dessa peça é de 12% (amostra de 50: 6 perdidas, 44 prontas)
    const peca = await api.criarPeca(nomeUnico('BOWL'), { qtdMinimaDesejada: 60, qtdMinimaBiscoito: 0 })
    const lote = await api.criarLote(peca.id, 50)
    const secagem = await api.etapa('Secagem')
    await api.levarAte(lote, peca, 'Secagem')
    await api.registrarPerda(lote.id, secagem, 6, 'rachou na secagem', 'trinca_secagem')
    const restante = { ...lote, quantidadeInicial: 44 }
    const etapas = await api.etapas()
    const caminho = ['Secagem', '1ª Queima', 'Biscoito', 'Esmaltação', '2ª Queima', 'Pronto'].map((n) => etapas.find((e) => e.nome === n)!)
    for (let i = 0; i < caminho.length - 1; i++) {
      await api.avancar(restante.id, caminho[i], caminho[i + 1], 44, caminho[i + 1].defineCor ? { corId: (await api.cor('Pistache')).id } : {})
    }
    await api.darBaixa(peca.id, (await api.cor('Pistache')).id, 34, 'venda')

    // Quando eu abrir o planejamento
    const plano = new PaginaPlanejamento(page)
    await plano.abrir()

    // Então a sugestão indica começar 57 peças (faltam 50; 50 ÷ 0,88 = 56,8)
    const sugestao = plano.sugestao(new RegExp(`^Produzir 57 ${nomeNoPlural(peca.nome)}$`))
    await expect(sugestao).toBeVisible()
    // E o motivo apresentado é a reposição do mínimo, com a perda medida
    await expect(sugestao).toContainText('Mínimo desejado 60')
    await expect(sugestao).toContainText(/perda medida desta peça é 12%/)
  })

  test('Alvo de estoque pela venda dos últimos 3 meses', async ({ page, api }) => {
    // Dado que a peça vendeu 52, 48 e 56 nos três últimos meses fechados (cerca de 12 por semana)
    // E que o cadastro diz mínimo 12, e não há nenhuma pronta
    const peca = await api.criarPeca(nomeUnico('BOWL'), { qtdMinimaDesejada: 12, qtdMinimaBiscoito: 0 })
    const pistache = await api.cor('Pistache')
    const mes = (atras: number) => {
      const d = new Date(Date.now() - 3 * 3600 * 1000)
      d.setUTCDate(1)
      d.setUTCMonth(d.getUTCMonth() - atras)
      return d.toISOString().slice(0, 7)
    }
    for (const [atras, quantidade] of [[3, 52], [2, 48], [1, 56]] as const) {
      await api.post('/vendas', { pecaId: peca.id, corId: pistache.id, competencia: mes(atras), quantidade, darBaixa: false })
    }

    // Quando eu abrir o planejamento
    const plano = new PaginaPlanejamento(page)
    await plano.abrir()

    // Então o alvo vem da venda, não do cadastro: 11,96/semana × (6 semanas de reposição + 2 de folga) = 96
    // E a sugestão já vem inflada pela perda estimada de 10%: começar 107
    const sugestao = plano.sugestao(new RegExp(`^Produzir 107 ${nomeNoPlural(peca.nome)}$`))
    await expect(sugestao).toBeVisible()
    await expect(sugestao).toContainText('Manter 96 pela venda')
    await expect(sugestao).toContainText('média de 3 meses fechados')
    await expect(sugestao).not.toContainText('Mínimo desejado 12')
  })

  test('Biscoito alocado sem duplicidade', async ({ page, api }) => {
    // Dado que há 20 peças em biscoito da peça E três cores abaixo do mínimo
    const peca = await api.criarPeca(nomeUnico('BOWL'), { cores: ['Pistache', 'Coral', 'Branco'] })
    const cores = await api.cores()
    const idDe = (n: string) => cores.find((c) => c.nome === n)!.id
    await api.put(`/pecas/${peca.id}`, {
      ...peca,
      qtdMinimaBiscoito: 0,
      roteiro: peca.roteiro.map((r) => ({ etapaId: r.etapaId, ordem: r.ordem, diasEstimados: r.diasEstimados ?? 1 })),
      cores: [
        { corId: idDe('Pistache'), qtdMinimaDesejada: 15 },
        { corId: idDe('Coral'), qtdMinimaDesejada: 15 },
        { corId: idDe('Branco'), qtdMinimaDesejada: 15 },
      ],
      insumos: [],
    })
    const lote = await api.criarLote(peca.id, 20)
    await api.levarAte(lote, peca, 'Biscoito')

    // Quando o plano for calculado
    const plano = new PaginaPlanejamento(page)
    await plano.abrir()

    // Então as 20 peças são repartidas entre as cores E a soma das sugestões de esmaltação não passa de 20
    const esmaltar = plano.sugestoes(new RegExp(`^Esmaltar \\d+ ${nomeNoPlural(peca.nome)} em`)).filter({ hasText: /^Esmaltar/ })
    await expect(esmaltar.first()).toBeVisible()
    const titulos = await esmaltar.getByRole('heading', { level: 2 }).allTextContents()
    const soma = titulos.reduce((n, t) => n + Number(t.match(/Esmaltar (\d+)/)?.[1] ?? 0), 0)
    expect(titulos.length).toBeGreaterThanOrEqual(2)
    expect(soma).toBeLessThanOrEqual(20)
    expect(soma).toBeGreaterThan(0)
  })

  test('Peça sem roteiro', async ({ page, api }) => {
    // Dado que a peça não tem roteiro cadastrado
    const peca = await api.criarPeca(nomeUnico('TIGELA'), { roteiro: [], qtdMinimaDesejada: 10 })

    // Quando ela aparecer no planejamento (e no Início) Então o sistema avisa que ela não pode virar lote
    const inicio = new PaginaInicio(page)
    await inicio.abrir()
    await expect(inicio.pendencia('Peças sem roteiro')).toContainText(peca.nome)

    const plano = new PaginaPlanejamento(page)
    await plano.abrir()
    const sugestao = plano.sugestoes(new RegExp(`^Produzir \\d+ ${nomeNoPlural(peca.nome)}$`)).first()
    await expect(sugestao).toBeVisible()
    await sugestao.getByRole('button', { name: /Abrir lote/ }).click()
    await plano.esperarMensagem(/não tem roteiro/)
  })
})
