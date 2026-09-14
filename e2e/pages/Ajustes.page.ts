import { expect, type Locator, type Page } from '@playwright/test'
import { PaginaBase } from './Base.page'

export class PaginaAjustes extends PaginaBase {
  constructor(page: Page) {
    super(page)
  }
  async abrir() {
    await this.page.goto('/ajustes')
    await expect(this.page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
  }
  chave(acao: 'Desligar' | 'Ligar', modulo: string): Locator {
    return this.page.getByRole('switch', { name: `${acao} ${modulo}` })
  }
}
