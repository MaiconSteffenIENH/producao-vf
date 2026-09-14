import { expect, type Locator, type Page } from '@playwright/test'
import { PaginaBase } from './Base.page'

export class PaginaInicio extends PaginaBase {
  constructor(page: Page) {
    super(page)
  }
  async abrir() {
    await this.page.goto('/')
    await expect(this.page.getByRole('heading', { name: /^Olá/ })).toBeVisible()
  }
  /** o bloco "Falta configurar" com a pendência pedida ("Peças sem roteiro") */
  pendencia(rotulo: string): Locator {
    return this.page.locator('div.rounded-2xl').filter({ hasText: rotulo }).first()
  }
}
