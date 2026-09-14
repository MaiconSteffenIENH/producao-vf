import { expect, type Locator, type Page } from '@playwright/test'
import { PaginaBase } from './Base.page'

export class PaginaForno extends PaginaBase {
  constructor(page: Page) {
    super(page)
  }
  async abrir() {
    await this.page.goto('/forno')
    await expect(this.page.getByRole('heading', { name: 'Forno' })).toBeVisible()
  }
  /** o cartão da fila: "1ª queima (biscoito)" ou "2ª queima (esmalte)" */
  fila(rotulo: string): Locator {
    return this.page.locator('div.rounded-2xl').filter({ has: this.page.getByRole('heading', { name: rotulo, level: 2 }) }).first()
  }
  fornada(codigo: string): Locator {
    return this.page.locator('div.rounded-2xl').filter({ has: this.page.getByRole('heading', { name: codigo, level: 3 }) }).first()
  }
  async montarFornada(rotuloDaFila: string) {
    await this.fila(rotuloDaFila).getByRole('button', { name: /Montar fornada/ }).click()
    await this.esperarMensagem(/Fornada .* montada/)
  }
  async acender(codigo: string) {
    await this.fornada(codigo).getByRole('button', { name: 'Acender' }).click()
  }
  async abrirConclusao(codigo: string) {
    await this.fornada(codigo).getByRole('button', { name: 'Concluir' }).click()
    await expect(this.janela(`Concluir ${codigo}`)).toBeVisible()
  }
  /** o bloco de um lote dentro da janela de conclusão */
  loteNaConclusao(codigoDoLote: string): Locator {
    return this.page.getByRole('dialog').locator('div.rounded-xl').filter({ hasText: codigoDoLote })
  }
  async concluir() {
    await this.page.getByRole('dialog').getByRole('button', { name: 'Concluir fornada' }).click()
  }
}
