import { expect, type Locator, type Page } from '@playwright/test'
import { PaginaBase } from './Base.page'

export class PaginaEncomendas extends PaginaBase {
  constructor(page: Page) {
    super(page)
  }
  async abrir() {
    await this.page.goto('/encomendas')
    await expect(this.page.getByRole('heading', { name: 'Encomendas' })).toBeVisible()
  }
  async novaEncomenda(o: { cliente: string; entregarAte: string; itens: { peca: string; quantidade: number }[] }) {
    await this.page.getByRole('button', { name: /Nova encomenda|Registrar/ }).first().click()
    const j = this.janela('Nova encomenda')
    await j.getByLabel('Cliente').fill(o.cliente)
    await j.getByLabel('Entregar até').fill(o.entregarAte)
    for (const [i, item] of o.itens.entries()) {
      if (i > 0) await j.getByRole('button', { name: 'Adicionar item' }).click()
      // o campo de peça ainda vazio é o último com o placeholder; os já escolhidos mudam de nome
      await this.escolher(j.getByRole('combobox', { name: '— peça —' }).last(), item.peca)
      await j.locator('input[inputmode="numeric"]').nth(i).fill(String(item.quantidade))
    }
    await j.getByRole('button', { name: /Registrar|Salvar/ }).click()
  }
  cartao(codigoOuCliente: string): Locator {
    return this.page.locator('div.rounded-2xl').filter({ hasText: codigoOuCliente }).first()
  }
}
