import { expect, type Locator, type Page } from '@playwright/test'
import { PaginaBase } from './Base.page'

export class PaginaAvisos extends PaginaBase {
  constructor(page: Page) {
    super(page)
  }
  async abrir() {
    await this.page.goto('/avisos')
    await expect(this.page.getByRole('heading', { name: 'Avisos' })).toBeVisible()
  }
  async novoAviso(o: { titulo: string; prazo?: string; detalhe?: string }) {
    await this.page.getByRole('button', { name: /Novo aviso/ }).click()
    const j = this.janela('Novo aviso')
    await j.getByLabel('O que precisa ser feito').fill(o.titulo)
    if (o.prazo) await j.getByLabel('Até quando').fill(o.prazo)
    if (o.detalhe) await j.getByLabel('Detalhe').fill(o.detalhe)
    await j.getByRole('button', { name: /Registrar|Salvar/ }).click()
  }
  coluna(nome: string): Locator {
    return this.page.locator('section').filter({ has: this.page.getByRole('heading', { name: nome, level: 2 }) })
  }
  card(titulo: string): Locator {
    return this.page.locator('div.cursor-grab').filter({ hasText: titulo })
  }
  cardEm(coluna: string, titulo: string): Locator {
    return this.coluna(coluna).locator('div.cursor-grab').filter({ hasText: titulo })
  }
  async marcarFeito(titulo: string) {
    await this.card(titulo).getByRole('button', { name: /Feito/ }).click()
  }
  resolvidos(): Locator {
    return this.page.locator('section, div').filter({ has: this.page.getByRole('heading', { name: 'Já resolvidos' }) }).last()
  }
}
