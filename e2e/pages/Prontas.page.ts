import { expect, type Locator, type Page } from '@playwright/test'
import { PaginaBase } from './Base.page'

export class PaginaProntas extends PaginaBase {
  constructor(page: Page) {
    super(page)
  }
  async abrir() {
    await this.page.goto('/estoque/prontas')
    await expect(this.page.getByRole('heading', { name: 'Peças prontas' })).toBeVisible()
  }
  /** a linha de uma peça+cor na lista */
  /** o grupo (cartão) de uma peça */
  grupo(peca: string): Locator {
    return this.page.locator('div.rounded-2xl').filter({ has: this.page.getByRole('heading', { name: peca }) })
  }
  linha(peca: string, cor?: string): Locator {
    const linhas = this.grupo(peca).locator('li')
    return cor ? linhas.filter({ hasText: cor }).first() : linhas.first()
  }
  async abrirBaixa(peca: string, cor?: string) {
    await this.linha(peca, cor).getByRole('button', { name: /Dar baixa|Baixa/ }).click()
    await expect(this.janela(/^Baixa de /)).toBeVisible()
  }
  async preencherBaixa(o: { motivo: string; quantas: number; observacao?: string }) {
    const j = this.janela(/^Baixa de /)
    await j.getByLabel('Motivo').selectOption({ label: o.motivo })
    await j.getByLabel('Quantas').fill(String(o.quantas))
    if (o.observacao) await j.getByLabel('Observação').fill(o.observacao)
  }
  async confirmarBaixa() {
    await this.janela(/^Baixa de /).getByRole('button', { name: /Confirmar|Dar baixa/ }).click()
  }
}
