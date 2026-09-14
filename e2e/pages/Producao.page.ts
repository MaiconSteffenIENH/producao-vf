import { expect, type Locator, type Page } from '@playwright/test'
import { PaginaBase } from './Base.page'

/** Quadro de produção: uma coluna por etapa, um cartão por lote. */
export class PaginaProducao extends PaginaBase {
  constructor(page: Page) {
    super(page)
  }
  async abrir() {
    await this.page.goto('/producao')
    await expect(this.page.getByRole('heading', { name: 'Produção' })).toBeVisible()
  }
  coluna(nomeDaEtapa: string): Locator {
    // a coluna é a <section data-etapa> cujo cabeçalho traz o nome da etapa
    return this.page.locator('section[data-etapa]').filter({ has: this.page.locator('header', { hasText: nomeDaEtapa }) })
  }
  /** o cartão do lote, em qualquer coluna */
  cartao(codigo: string): Locator {
    return this.page.locator('article').filter({ hasText: codigo })
  }
  /** o cartão do lote dentro de uma coluna específica */
  cartaoEm(nomeDaEtapa: string, codigo: string): Locator {
    return this.coluna(nomeDaEtapa).locator('article').filter({ hasText: codigo })
  }
  /** a quantidade escrita na pastilha do cartão */
  quantidadeDoCartao(cartao: Locator): Locator {
    return cartao.locator('span.rounded-full').first()
  }

  async abrirMover(codigo: string) {
    await this.cartao(codigo).getByRole('button', { name: 'Mover' }).click()
    await expect(this.janela(`Mover ${codigo}`)).toBeVisible()
  }
  async preencherMover(o: { para: string; quantidade: number; esmalte?: string; observacao?: string }) {
    const j = this.janela(/^Mover /)
    await j.getByLabel('Para qual etapa').selectOption({ label: o.para })
    await j.getByLabel('Quantidade').fill(String(o.quantidade))
    if (o.esmalte) await this.escolher(j.getByLabel('Esmalte'), o.esmalte)
    if (o.observacao) await j.getByLabel('Observação').fill(o.observacao)
  }
  async confirmar() {
    await this.page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click()
  }
  async abrirPerda(codigo: string) {
    await this.cartao(codigo).getByRole('button', { name: 'Perda' }).click()
    await expect(this.janela(`Registrar perda em ${codigo}`)).toBeVisible()
  }
  async preencherPerda(o: { quantidade: number; motivoTipo?: string; relato?: string }) {
    const j = this.janela(/^Registrar perda/)
    await j.getByLabel('Quantidade').fill(String(o.quantidade))
    if (o.motivoTipo) await j.getByLabel('Motivo da perda').selectOption({ label: o.motivoTipo })
    if (o.relato !== undefined) await j.getByLabel('O que aconteceu').fill(o.relato)
  }
  async abrirSegunda(codigo: string) {
    await this.cartao(codigo).getByRole('button', { name: 'Segunda' }).click()
    await expect(this.janela(`Separar segunda qualidade de ${codigo}`)).toBeVisible()
  }
  async preencherSegunda(o: { quantidade: number; defeito: string }) {
    const j = this.janela(/^Separar segunda/)
    await j.getByLabel('Quantidade').fill(String(o.quantidade))
    await j.getByLabel('Qual o defeito').fill(o.defeito)
  }
}
