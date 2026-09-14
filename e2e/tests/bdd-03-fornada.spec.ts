import { expect, test } from '../fixtures/teste'
import { nomeUnico } from '../fixtures/dados'
import { PaginaForno } from '../pages/Forno.page'

/*
 * BDD-3 · UC-06 · Montar e concluir fornada
 * SENDO o operador do forno
 * POSSO concluir uma fornada informando o que quebrou
 * PARA não precisar repetir no quadro o que já registrei aqui
 */
test.describe('BDD-3 Montar e concluir fornada', () => {
  test.beforeEach(async ({ api }) => {
    await api.esvaziarFilaDoForno()
  })

  test('Conclusão com quebra', async ({ page, api }) => {
    // Dado que a fornada tem 80 peças de três lotes
    const peca = await api.criarPeca(nomeUnico('PRATO'))
    const lotes = []
    for (const q of [30, 30, 20]) {
      const l = await api.criarLote(peca.id, q)
      await api.levarAte(l, peca, '1ª Queima')
      lotes.push(l)
    }
    const forno = new PaginaForno(page)
    await forno.abrir()
    await expect(forno.fila('1ª queima (biscoito)')).toContainText('pode queimar')
    await forno.montarFornada('1ª queima (biscoito)')
    const [queima] = await api.queimas('carregando')
    await forno.acender(queima.codigo)
    await expect(forno.fornada(queima.codigo)).toContainText('queimando')

    // Quando eu concluo informando 3 peças quebradas do primeiro lote
    await forno.abrirConclusao(queima.codigo)
    const bloco = forno.loteNaConclusao(lotes[0].codigo)
    await bloco.getByLabel('Quebrou').fill('3')
    await bloco.getByLabel('O que houve').fill('trincou no forno')
    await expect(forno.janela(`Concluir ${queima.codigo}`)).toContainText(/77.*seguem/)
    await forno.concluir()
    await forno.esperarMensagem(/conclu/i)

    // Então as 3 peças viram perda com motivo de forno
    const d0 = await api.lote(lotes[0].id)
    const perda = d0.movimentos.find((m) => m.tipo === 'perda')
    expect(perda?.quantidade).toBe(3)
    expect(perda?.motivoTipo).toBe('quebra_forno')
    // E as 77 restantes avançam para a etapa seguinte de cada roteiro (Biscoito)
    expect(await api.saldoEm(lotes[0].id, 'Biscoito')).toBe(27)
    expect(await api.saldoEm(lotes[1].id, 'Biscoito')).toBe(30)
    expect(await api.saldoEm(lotes[2].id, 'Biscoito')).toBe(20)
    expect(await api.saldoEm(lotes[0].id, '1ª Queima')).toBe(0)
  })

  test('Falha no meio da conclusão', async ({ page, api }) => {
    const peca = await api.criarPeca(nomeUnico('PRATO'))
    const a = await api.criarLote(peca.id, 40)
    const b = await api.criarLote(peca.id, 40)
    await api.levarAte(a, peca, '1ª Queima')
    await api.levarAte(b, peca, '1ª Queima')
    const forno = new PaginaForno(page)
    await forno.abrir()
    await forno.montarFornada('1ª queima (biscoito)')
    const [queima] = await api.queimas('carregando')
    await forno.acender(queima.codigo)
    await expect(forno.fornada(queima.codigo)).toContainText('queimando')

    // Dado que a conclusão da fornada falhou ao gravar (quebra maior que o lote: o servidor recusa no meio da transação)
    const resposta = await api.raw().post(`/queimas/${queima.id}/concluir`, {
      data: { quebras: [{ loteId: a.id, quantidade: 2, motivo: 'trincou' }, { loteId: b.id, quantidade: 999, motivo: 'x' }] },
    })
    // Quando a operação for interrompida
    expect(resposta.ok()).toBe(false)

    // Então nenhum movimento é gravado (nem o do lote válido)
    expect(await api.saldoEm(a.id, '1ª Queima')).toBe(40)
    expect(await api.saldoEm(b.id, '1ª Queima')).toBe(40)
    expect((await api.lote(a.id)).movimentos.some((m) => m.tipo === 'perda')).toBe(false)
    // E a fornada continua com o status anterior
    await forno.abrir()
    await expect(forno.fornada(queima.codigo)).toContainText('queimando')
  })

  test('Carga incompleta', async ({ page, api }) => {
    // Dado que há 68 peças na fila e a capacidade é 80
    const peca = await api.criarPeca(nomeUnico('PRATO'))
    const l = await api.criarLote(peca.id, 68)
    await api.levarAte(l, peca, '1ª Queima')

    // Quando eu abrir a tela do forno
    const forno = new PaginaForno(page)
    await forno.abrir()

    // Então o sistema informa que faltam 12 peças para fechar a carga
    const fila = forno.fila('1ª queima (biscoito)')
    await expect(fila).toContainText('faltam 12')
    await expect(fila).toContainText('68 de 80 lugares')
  })
})
