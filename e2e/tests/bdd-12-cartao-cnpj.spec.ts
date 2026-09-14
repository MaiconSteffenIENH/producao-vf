import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '../fixtures/teste'

/*
 * BDD-12 · UC-12 · Cadastrar cliente a partir do cartão CNPJ (EM TESTE)
 * SENDO a auxiliar administrativa
 * POSSO cadastrar uma empresa a partir do cartão CNPJ
 * PARA não digitar o que a Receita já imprimiu
 *
 * O módulo vive na branch cadastros/clientes-fornecedores. No master a rota
 * não existe, então os cenários só rodam com E2E_INCLUIR_EM_TESTE=1.
 * Contrato esperado: POST /clientes/ler-cartao { texto } → { cadastro }.
 */
const cartao = (nome: string) => readFileSync(join(__dirname, '..', 'test-data', nome), 'utf8')

test.describe('BDD-12 Cadastrar cliente a partir do cartão CNPJ', () => {
  test.skip(!process.env.E2E_INCLUIR_EM_TESTE, 'módulo em teste: branch cadastros/clientes-fornecedores')

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
})
