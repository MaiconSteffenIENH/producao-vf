import { expect, type Locator, type Page } from '@playwright/test'
import { PaginaBase } from './Base.page'

export class PaginaPrecos extends PaginaBase {
  constructor(page: Page) {
    super(page)
  }
  async abrir() {
    await this.page.goto('/precos')
    await expect(this.page.getByRole('heading', { name: 'Preços' })).toBeVisible()
  }
  linha(peca: string): Locator {
    return this.page.locator('div.rounded-2xl').filter({ hasText: peca }).first()
  }
}
