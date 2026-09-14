import { expect, type Page } from '@playwright/test'
import { PaginaBase } from './Base.page'

export class PaginaPecas extends PaginaBase {
  constructor(page: Page) {
    super(page)
  }
  async abrir() {
    await this.page.goto('/pecas')
    await expect(this.page.getByRole('heading', { name: 'Peças' })).toBeVisible()
  }
  async editar(nome: string) {
    await this.page.getByPlaceholder('Buscar peça…').fill(nome)
    await this.page.getByRole('button', { name: `Editar ${nome}` }).click()
    await expect(this.janela(`Editar ${nome}`)).toBeVisible()
  }
  get janelaDaPeca() {
    return this.page.getByRole('dialog')
  }
  async preencherFicha(f: {
    altura?: string
    boca?: string
    pesoCru?: string
    tolerancia?: string
    momento?: '' | 'Peça crua, antes de secar' | 'Peça pronta, depois da 2ª queima'
  }) {
    const j = this.janelaDaPeca
    if (f.altura !== undefined) await j.getByLabel('Altura (cm)').fill(f.altura)
    if (f.boca !== undefined) await j.getByLabel('Diâmetro da boca (cm)').fill(f.boca)
    if (f.pesoCru !== undefined) await j.getByLabel('Peso do barro cru (g)').fill(f.pesoCru)
    if (f.tolerancia !== undefined) await j.getByLabel('Tolerância (%)').fill(f.tolerancia)
    if (f.momento !== undefined) await j.getByLabel('Momento da medição').selectOption({ label: f.momento || '— não definido —' })
  }
  async salvar() {
    await this.janelaDaPeca.getByRole('button', { name: 'Salvar' }).click()
  }
}
