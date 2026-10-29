import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '../fixtures/teste'

/*
 * BDD-12 · UC-12 · Cadastrar cliente a partir do cartão CNPJ
 * SENDO a auxiliar administrativa
 * POSSO cadastrar uma empresa a partir do cartão CNPJ
 * PARA não digitar o que a Receita já imprimiu
 *
 * Em produção desde 29/10/2026 (tela Clientes e fornecedores).
 * Contrato: POST /clientes/ler-cartao { texto } → { cadastro }, sem gravar.
 */
const cartao = (nome: string) => readFileSync(join(__dirname, '..', 'test-data', nome), 'utf8')

test.describe('BDD-12 Cadastrar cliente a partir do cartão CNPJ', () => {
  test('Cartão lido inteiro', async ({ api }) => {
    // Dado que enviei o cartão da Cerâmica Vera Flesch Quando o sistema ler o PDF
    const { cadastro } = await api.post<{ cadastro: Record<string, string | null> }>('/clientes/ler-cartao', { texto: cartao('cartao-ceramica.txt') })
    // Então o nome vem "CERAMICA VERA FLESCH" E o CNPJ vem 46.370.338/0001-36
    expect(cadastro.nome).toBe('CERAMICA VERA FLESCH')
    expect(cadastro.documento).toBe('46.370.338/0001-36')
    // E o município vem NOVO HAMBURGO e o bairro RIO BRANCO
    expect(cadastro.cidade).toBe('NOVO HAMBURGO')
    expect(cadastro.bairro).toBe('RIO BRANCO')
    // E a razão social vai para a observação
    expect(cadastro.observacao).toContain('CERAMICA VERA FLESCH LTDA')
  })

  test('Colunas de largura diferente', async ({ api }) => {
    const { cadastro } = await api.post<{ cadastro: Record<string, string | null> }>('/clientes/ler-cartao', { texto: cartao('cartao-nexa.txt') })
    // Então bairro e município não se confundem E o complemento "APT 13" é lido
    expect(cadastro.bairro).toBe('RIO BRANCO')
    expect(cadastro.cidade).toBe('NOVO HAMBURGO')
    expect(cadastro.endereco).toContain('APT 13')
  })

  test('Lugar-vazio não vira dado', async ({ api }) => {
    const { cadastro } = await api.post<{ cadastro: Record<string, string | null> }>('/clientes/ler-cartao', { texto: cartao('cartao-ceramica.txt') })
    // Então o complemento fica vazio (asteriscos não são dado) E o telefone fica só com o número real
    expect(cadastro.endereco).not.toContain('*')
    expect(cadastro.telefone ?? '').not.toContain('0000')
  })

  test('PDF errado', async ({ api }) => {
    // Dado que enviei uma nota fiscal em vez do cartão Quando o sistema ler Então recusa e explica
    const r = await api.raw().post('/clientes/ler-cartao', { data: { texto: 'DANFE\nNOTA FISCAL ELETRÔNICA\nNúmero 000.123' } })
    expect(r.status()).toBe(422)
    expect(await r.text()).toMatch(/não é um cartão CNPJ/i)
  })

  test('Cadastro pela tela, colando o cartão', async ({ page }) => {
    // Dado que estou em Clientes e fornecedores Quando colo o cartão e salvo
    await page.goto('/clientes')
    await page.getByRole('button', { name: /Novo cliente/ }).click()
    await page.getByRole('button', { name: /Preencher pelo cartão CNPJ/ }).click()
    await page.getByRole('dialog', { name: 'Colar cartão CNPJ' }).getByLabel('Texto do cartão').fill(cartao('cartao-nexa.txt'))
    await page.getByRole('button', { name: 'Ler cartão' }).click()
    // Então o formulário vem preenchido E salvar cria o cadastro na lista
    const form = page.getByRole('dialog', { name: 'Novo cliente' })
    await expect(form.getByLabel('Cidade')).toHaveValue('NOVO HAMBURGO')
    const nome = await form.getByLabel(/^Nome/).inputValue()
    await form.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'salvo' })).toBeVisible()
    await expect(page.getByText(nome, { exact: true }).first()).toBeVisible()
  })
})
