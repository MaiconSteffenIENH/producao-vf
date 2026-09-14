import { expect, test } from '../fixtures/teste'
import { nomeUnico } from '../fixtures/dados'
import { PaginaProducao } from '../pages/Producao.page'
import { PaginaPrecos } from '../pages/Precos.page'

/*
 * BDD-5 · UC-04 · Registrar perda com motivo
 * SENDO uma pessoa da equipe de produção
 * POSSO registrar uma perda com o motivo
 * PARA que a taxa de perda de cada peça seja medida e não chutada
 */
test.describe('BDD-5 Registrar perda com motivo', () => {
  test('Perda com motivo', async ({ page, api }) => {
    // Dado que o lote tem 30 peças na Secagem
    const peca = await api.criarPeca(nomeUnico('BULE'))
    const lote = await api.criarLote(peca.id, 30)
    await api.levarAte(lote, peca, 'Secagem')

    // Quando eu registro 4 peças perdidas com motivo "rachou na secagem"
    const quadro = new PaginaProducao(page)
    await quadro.abrir()
    await quadro.abrirPerda(lote.codigo)
    await quadro.preencherPerda({ quantidade: 4, motivoTipo: 'Trincou na secagem', relato: 'rachou na secagem' })
    await quadro.confirmar()
    await quadro.esperarMensagem('Perda registrada.')

    // Então a Secagem fica com 26 peças
    await expect(quadro.quantidadeDoCartao(quadro.cartaoEm('Secagem', lote.codigo))).toHaveText('26')
    // E o lançamento de perda guarda o motivo
    const d = await api.lote(lote.id)
    const perda = d.movimentos.find((m) => m.tipo === 'perda')
    expect(perda?.quantidade).toBe(4)
    expect(perda?.motivoTipo).toBe('trinca_secagem')
    expect(perda?.motivo).toBe('rachou na secagem')
    // E a peça passa a ter 4 perdidas na amostra
    expect(d.perdaTotal).toBe(4)
  })

  test('Perda sem motivo', async ({ page, api }) => {
    const peca = await api.criarPeca(nomeUnico('BULE'))
    const lote = await api.criarLote(peca.id, 30)
    await api.levarAte(lote, peca, 'Secagem')
    const quadro = new PaginaProducao(page)
    await quadro.abrir()
    // Dado que abri a janela de perda
    await quadro.abrirPerda(lote.codigo)
    await quadro.preencherPerda({ quantidade: 2, relato: 'caiu' })
    // Quando eu tento confirmar sem escolher o motivo
    await quadro.confirmar()
    // Então o sistema recusa e pede o motivo (o campo é obrigatório: a janela continua aberta e nada foi gravado)
    const motivo = quadro.janela(/^Registrar perda/).getByLabel('Motivo da perda')
    await expect(motivo).toHaveJSProperty('validity.valueMissing', true)
    await expect(quadro.janela(/^Registrar perda/)).toBeVisible()
    expect((await api.lote(lote.id)).perdaTotal).toBe(0)
  })

  test('Segunda qualidade não é perda', async ({ page, api }) => {
    // Dado que 3 peças do lote têm defeito pequeno
    const peca = await api.criarPeca(nomeUnico('BULE'))
    const lote = await api.criarLote(peca.id, 30)
    await api.levarAte(lote, peca, 'Secagem')
    const quadro = new PaginaProducao(page)
    await quadro.abrir()
    // Quando eu as separo como segunda qualidade
    await quadro.abrirSegunda(lote.codigo)
    await quadro.preencherSegunda({ quantidade: 3, defeito: 'alça torta' })
    await quadro.confirmar()
    await quadro.esperarMensagem('Separado como segunda qualidade.')
    // Então elas vão para a etapa de segunda E continuam contando como saldo
    await expect(quadro.quantidadeDoCartao(quadro.cartaoEm('Segunda qualidade', lote.codigo))).toHaveText('3')
    await expect(quadro.quantidadeDoCartao(quadro.cartaoEm('Secagem', lote.codigo))).toHaveText('27')
    const d = await api.lote(lote.id)
    expect(d.saldoTotal).toBe(30)
    // E a taxa de perda da peça não muda
    expect(d.perdaTotal).toBe(0)
  })

  test('Amostra mínima para a perda medida', async ({ page, api }) => {
    // Dado que a peça tem 20 peças na amostra e 10 perdidas
    const peca = await api.criarPeca(nomeUnico('TIGELA'))
    await api.definirCusto(peca.id, 8)
    const lote = await api.criarLote(peca.id, 20)
    const secagem = await api.etapa('Secagem')
    await api.levarAte(lote, peca, 'Secagem')
    await api.registrarPerda(lote.id, secagem, 10, 'trincou', 'trinca_secagem')
    const etapas = await api.etapas()
    const caminho = ['Secagem', '1ª Queima', 'Biscoito', 'Esmaltação', '2ª Queima', 'Pronto'].map((n) => etapas.find((e) => e.nome === n)!)
    for (let i = 0; i < caminho.length - 1; i++) {
      await api.avancar(lote.id, caminho[i], caminho[i + 1], 10, caminho[i + 1].defineCor ? { corId: (await api.cor('Coral')).id } : {})
    }

    // Quando o preço for calculado
    const precos = new PaginaPrecos(page)
    await precos.abrir()
    // Então o sistema usa a perda estimada do cadastro E não os 50% medidos, porque a amostra é menor que 30
    const linha = precos.linha(peca.nome)
    await expect(linha).toContainText('8.0%')
    await expect(linha).toContainText('estimada')
    await expect(linha).not.toContainText('50.0%')
  })
})
