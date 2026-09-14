import { expect, type Locator, type Page } from '@playwright/test'
import { PaginaBase } from './Base.page'

export class PaginaVendas extends PaginaBase {
  constructor(page: Page) {
    super(page)
  }
  async abrir() {
    await this.page.goto('/vendas')
    await expect(this.page.getByRole('heading', { name: 'Vendas e cobertura' })).toBeVisible()
  }
  async abrirImportacao() {
    await this.page.getByRole('button', { name: /Importar/ }).first().click()
    await expect(this.janela('Importar planilha de vendas')).toBeVisible()
  }
  async colarEImportar(csv: string) {
    const j = this.janela('Importar planilha de vendas')
    await j.getByLabel('Ou cole o conteúdo').fill(csv)
    await j.getByRole('button', { name: 'Importar' }).click()
  }
  get resultadoDaImportacao(): Locator {
    return this.janela('Importar planilha de vendas').locator('div.rounded-xl')
  }
  linhaDaPeca(nome: string): Locator {
    return this.page.locator('div.rounded-2xl').filter({ has: this.page.getByRole('heading', { name: nome }) }).first()
  }
  /** o cartão de uma venda lançada (tem o botão "Devolvida") */
  vendaDe(nome: string): Locator {
    return this.page.locator('div.rounded-2xl').filter({ has: this.page.getByRole('heading', { name: nome, level: 3 }) }).first()
  }
}
