import { expect, type Locator, type Page } from '@playwright/test'

/** o que toda tela tem: menu lateral, mensagens de rodapé (toast) e janelas */
export class PaginaBase {
  constructor(readonly page: Page) {}

  /** a última mensagem que o sistema mostrou no rodapé */
  get mensagem(): Locator {
    return this.page.getByRole('status').getByRole('button')
  }
  async esperarMensagem(texto: string | RegExp) {
    await expect(this.mensagem.filter({ hasText: texto }).first()).toBeVisible()
  }
  janela(titulo: string | RegExp): Locator {
    return this.page.getByRole('dialog', { name: titulo })
  }
  /** escolhe uma opção num campo de busca (combobox) pelo rótulo do campo */
  async escolher(campo: Locator, opcao: string) {
    await campo.click()
    await campo.fill(opcao)
    await this.page.getByRole('option', { name: opcao, exact: true }).first().click()
  }
  /** item do menu lateral; o nome acessível ganha a pastilha ("Avisos 2"), por isso o prefixo */
  menu(rotulo: string): Locator {
    return this.page.getByRole('navigation').first().getByRole('link', { name: new RegExp(`^${rotulo}(\\s|$)`) })
  }
}
