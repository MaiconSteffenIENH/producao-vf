import { readFileSync } from 'node:fs'
import { expect, test } from '../fixtures/teste'
import { nomeUnico } from '../fixtures/dados'

/*
 * BDD-15 · UC-15 · Exportar o histórico em planilha
 * SENDO a dona do ateliê
 * POSSO baixar os movimentos de um período em planilha
 * PARA conferir fora do sistema e mandar para o contador
 */
test.describe('BDD-15 Exportar o histórico em planilha', () => {
  test('Planilha do período com o movimento de hoje', async ({ page, api }) => {
    // Dado que movi um lote hoje
    const peca = await api.criarPeca(nomeUnico('TIGELA'))
    const lote = await api.criarLote(peca.id, 9)
    await api.levarAte(lote, peca, 'Secagem')

    // Quando exporto o mês na tela de Histórico
    await page.goto('/historico')
    await page.getByRole('button', { name: /Exportar planilha/ }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Baixar planilha' }).click()
    const arquivo = await download

    // Então o arquivo é um CSV que abre no Excel E traz o lote com a peça e a etapa
    expect(arquivo.suggestedFilename()).toMatch(/^movimentos-.*\.csv$/)
    const texto = readFileSync((await arquivo.path())!, 'utf8')
    expect(texto.startsWith('﻿Data e hora;Lote;Peça')).toBe(true)
    const linha = texto.split('\r\n').find((l) => l.includes(lote.codigo) && l.includes('Secagem'))
    expect(linha).toContain(peca.nome)
  })
})
