import { expect, type Locator, type Page } from '@playwright/test'
import { PaginaBase } from './Base.page'

export class PaginaPlanejamento extends PaginaBase {
  constructor(page: Page) {
    super(page)
  }
  async abrir() {
    await this.page.goto('/planejamento')
    await expect(this.page.getByRole('heading', { name: 'Planejamento' })).toBeVisible()
  }
  /** todos os cartões de sugestão cujo título cita a peça */
  sugestoes(titulo: string | RegExp): Locator {
    return this.page.locator('div.rounded-2xl').filter({ has: this.page.getByRole('heading', { name: titulo, level: 2 }) })
  }
  sugestao(titulo: string | RegExp): Locator {
    return this.page.locator('div.rounded-2xl').filter({ has: this.page.getByRole('heading', { name: titulo, level: 2 }) }).first()
  }
}
