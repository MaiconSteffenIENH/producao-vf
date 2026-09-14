import { expect, type Page } from '@playwright/test'
import { PaginaBase } from './Base.page'

export class PaginaEtapas extends PaginaBase {
  constructor(page: Page) {
    super(page)
  }
  async abrir() {
    await this.page.goto('/etapas')
    await expect(this.page.getByRole('heading', { name: 'Etapas' })).toBeVisible()
  }
  async novaEtapa(o: { nome: string; defineCor?: boolean }) {
    await this.page.getByRole('button', { name: 'Novo' }).click()
    const j = this.janela('Novo em Etapas')
    await expect(j).toBeVisible()
    await j.getByLabel('Nome', { exact: true }).fill(o.nome)
    if (o.defineCor) {
      const caixa = j.getByLabel('É aqui que a cor é decidida')
      await caixa.check()
      await expect(caixa).toBeChecked()
    }
    await j.getByRole('button', { name: 'Salvar' }).click()
  }
}
