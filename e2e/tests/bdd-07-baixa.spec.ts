import { expect, test } from '../fixtures/teste'
import { competenciaDeHoje, nomeUnico } from '../fixtures/dados'
import { PaginaProntas } from '../pages/Prontas.page'
import { PaginaPrecos } from '../pages/Precos.page'
import { PaginaVendas } from '../pages/Vendas.page'
import type { Api, Peca } from '../fixtures/api'

/** leva um lote inteiro até Pronto na cor pedida */
async function prontoEm(api: Api, peca: Peca, quantidade: number, cor: string, iniciadoEm?: string) {
  const lote = await api.criarLote(peca.id, quantidade, iniciadoEm ? { iniciadoEm } : {})
  await api.levarAte(lote, peca, 'Pronto', cor)
  return lote
}

/*
 * BDD-7 · UC-07 · Dar baixa em peça pronta
 * SENDO a auxiliar administrativa
 * POSSO dar baixa em peças prontas
 * PARA o estoque bater com a prateleira sem inflar a perda
 */
test.describe('BDD-7 Dar baixa em peça pronta', () => {
  test('Baixa sai do lote mais antigo', async ({ page, api }) => {
    // Dado que a peça Pistache tem 5 prontas de um lote de junho e 8 de um lote de agosto
    const peca = await api.criarPeca(nomeUnico('BOWL'))
    const antigo = await prontoEm(api, peca, 5, 'Pistache', '2026-06-10')
    const novo = await prontoEm(api, peca, 8, 'Pistache', '2026-08-10')

    // Quando eu dou baixa de 7 por venda na Shopee
    const prontas = new PaginaProntas(page)
    await prontas.abrir()
    await prontas.abrirBaixa(peca.nome, 'Pistache')
    await prontas.preencherBaixa({ motivo: 'Venda', canal: 'Shopee', quantas: 7 })
    await prontas.confirmarBaixa()
    await prontas.esperarMensagem(/Baixadas 7/)

    // Então saem as 5 do lote antigo e 2 do novo E sobram 6 no novo
    expect(await api.saldoEm(antigo.id, 'Pronto')).toBe(0)
    expect(await api.saldoEm(novo.id, 'Pronto')).toBe(6)
    await expect(prontas.linha(peca.nome, 'Pistache')).toContainText('6 peças prontas')

    // E a venda de 7 já está em Vendas, na Shopee, no mês de hoje (é um fato só, contado uma vez)
    await prontas.esperarMensagem(/Venda registrada em Shopee: 7 peças no mês/)
    const shopee = await api.canal('Shopee')
    const venda = (await api.vendas(competenciaDeHoje())).find((v) => v.pecaId === peca.id && v.canalId === shopee.id)
    expect(venda?.quantidade).toBe(7)
  })

  test('Venda não é perda', async ({ page, api }) => {
    // Dado que a peça tem taxa de perda de 10% (amostra 40: 4 perdidas, 36 prontas)
    const peca = await api.criarPeca(nomeUnico('BOWL'))
    await api.definirCusto(peca.id, 25)
    const lote = await api.criarLote(peca.id, 40)
    await api.levarAte(lote, peca, 'Secagem')
    await api.registrarPerda(lote.id, await api.etapa('Secagem'), 4, 'trincou', 'trinca_secagem')
    const etapas = await api.etapas()
    const caminho = ['Secagem', '1ª Queima', 'Biscoito', 'Esmaltação', '2ª Queima', 'Pronto'].map((n) => etapas.find((e) => e.nome === n)!)
    for (let i = 0; i < caminho.length - 1; i++) {
      await api.avancar(lote.id, caminho[i], caminho[i + 1], 36, caminho[i + 1].defineCor ? { corId: (await api.cor('Pistache')).id } : {})
    }
    const precos = new PaginaPrecos(page)
    await precos.abrir()
    await expect(precos.linha(peca.nome)).toContainText('10.0%')
    await expect(precos.linha(peca.nome)).toContainText('medida em 40 peças')

    // Quando eu dou baixa de 7 por venda
    const prontas = new PaginaProntas(page)
    await prontas.abrir()
    await prontas.abrirBaixa(peca.nome, 'Pistache')
    await prontas.preencherBaixa({ motivo: 'Venda', canal: 'Mercado Livre', quantas: 7 })
    await prontas.confirmarBaixa()
    await prontas.esperarMensagem(/Baixadas 7/)

    // Então a taxa de perda continua em 10%
    await precos.abrir()
    await expect(precos.linha(peca.nome)).toContainText('10.0%')
    await expect(precos.linha(peca.nome)).toContainText('medida em 40 peças')
  })

  test('Quebra depois de pronta', async ({ page, api }) => {
    // Dado que a peça tem 100 concluídas e 10 perdidas
    const peca = await api.criarPeca(nomeUnico('BOWL'))
    await api.definirCusto(peca.id, 25)
    const lote = await api.criarLote(peca.id, 110)
    await api.levarAte(lote, peca, 'Secagem')
    await api.registrarPerda(lote.id, await api.etapa('Secagem'), 10, 'trincou', 'trinca_secagem')
    const etapas = await api.etapas()
    const caminho = ['Secagem', '1ª Queima', 'Biscoito', 'Esmaltação', '2ª Queima', 'Pronto'].map((n) => etapas.find((e) => e.nome === n)!)
    for (let i = 0; i < caminho.length - 1; i++) {
      await api.avancar(lote.id, caminho[i], caminho[i + 1], 100, caminho[i + 1].defineCor ? { corId: (await api.cor('Branco')).id } : {})
    }
    const precos = new PaginaPrecos(page)
    await precos.abrir()
    await expect(precos.linha(peca.nome)).toContainText('9.1%')
    await expect(precos.linha(peca.nome)).toContainText('medida em 110 peças')

    // Quando eu dou baixa de 2 por quebra
    const prontas = new PaginaProntas(page)
    await prontas.abrir()
    await prontas.abrirBaixa(peca.nome, 'Branco')
    await prontas.preencherBaixa({ motivo: 'Quebrou depois de pronta', quantas: 2 })
    await prontas.confirmarBaixa()
    await prontas.esperarMensagem(/Baixadas 2/)

    // Então a perda passa a 12 e as concluídas a 98 E a peça não é contada duas vezes na amostra (12 ÷ 110 = 10,9%)
    await precos.abrir()
    await expect(precos.linha(peca.nome)).toContainText('10.9%')
    await expect(precos.linha(peca.nome)).toContainText('medida em 110 peças')
    expect((await api.lote(lote.id)).perdaTotal).toBe(12)
    expect(await api.saldoEm(lote.id, 'Pronto')).toBe(98)
  })

  test('Devolução não é peça nova', async ({ page, api }) => {
    // Dado que vendi 7 Pistache
    const peca = await api.criarPeca(nomeUnico('BOWL'))
    await api.definirCusto(peca.id, 25)
    const lote = await api.criarLote(peca.id, 30)
    await api.levarAte(lote, peca, 'Secagem')
    await api.registrarPerda(lote.id, await api.etapa('Secagem'), 2, 'trincou', 'trinca_secagem')
    const etapas = await api.etapas()
    const caminho = ['Secagem', '1ª Queima', 'Biscoito', 'Esmaltação', '2ª Queima', 'Pronto'].map((n) => etapas.find((e) => e.nome === n)!)
    for (let i = 0; i < caminho.length - 1; i++) {
      await api.avancar(lote.id, caminho[i], caminho[i + 1], 28, caminho[i + 1].defineCor ? { corId: (await api.cor('Pistache')).id } : {})
    }
    const pistache = await api.cor('Pistache')
    const competencia = new Date().toISOString().slice(0, 7)
    await api.registrarVenda(peca.id, pistache.id, competencia, 7)
    expect(await api.saldoEm(lote.id, 'Pronto')).toBe(21)

    // Quando eu registro a devolução de 2
    const vendas = new PaginaVendas(page)
    await vendas.abrir()
    const venda = vendas.vendaDe(peca.nome)
    await venda.getByRole('button', { name: 'Devolvida' }).click()
    const j = vendas.janela(new RegExp(`Devolução de ${peca.nome}`))
    await j.getByLabel('Quantas voltaram').fill('2')
    await j.getByRole('button', { name: 'Voltou ao estoque' }).click()
    await vendas.esperarMensagem(/2 peça\(s\) de volta ao estoque/)

    // Então as 2 voltam ao estoque de prontas
    expect(await api.saldoEm(lote.id, 'Pronto')).toBe(23)
    // E a amostra de concluídas não aumenta (2 perdidas + 28 prontas = 30, antes e depois)
    const precos = new PaginaPrecos(page)
    await precos.abrir()
    await expect(precos.linha(peca.nome)).toContainText('medida em 30 peças')
  })
})
