import { expect, test } from '../fixtures/teste'
import { ddmm, diaDoAtelie, nomeUnico, proximo } from '../fixtures/dados'
import { PaginaAvisos } from '../pages/Avisos.page'
import { PaginaProducao } from '../pages/Producao.page'

const diaDaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay()
const ehDiaUtil = (iso: string) => diaDaSemana(iso) >= 1 && diaDaSemana(iso) <= 5
/** dias de calendário entre dois AAAA-MM-DD */
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
/** sexta anterior (ou o próprio dia, se já for dia útil) */
const diaUtil = (iso: string) => {
  const d = diaDaSemana(iso)
  if (d === 6) return diaDoAtelieRelativo(iso, -1)
  if (d === 0) return diaDoAtelieRelativo(iso, -2)
  return iso
}
const diaDoAtelieRelativo = (iso: string, dias: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)

/*
 * BDD-10 · UC-10 · Registrar aviso no quadro
 * SENDO o operador do forno
 * POSSO ver no menu que há um combinado pendente
 * PARA não perder o correio das 17h mesmo estando em outra tela
 */
test.describe('BDD-10 Registrar aviso no quadro', () => {
  test.beforeEach(async ({ api }) => {
    await api.apagarAvisosAbertos()
  })

  test('Aviso futuro deixa o menu âmbar', async ({ page, api }) => {
    // Dado que registrei "despachar bandeja" para daqui a 3 dias
    const prazo = diaDoAtelie(3)
    const titulo = nomeUnico('DESPACHAR BANDEJA')
    await api.criarAviso(titulo, prazo)

    // Quando eu estiver no quadro de produção
    const quadro = new PaginaProducao(page)
    await quadro.abrir()

    // Então o item Avisos do menu aparece em âmbar com a contagem
    const item = quadro.menu('Avisos')
    await expect(item).toHaveAttribute('data-alerta', 'programado')
    await expect(item).toContainText('1')
  })

  test('No dia, fica vermelho', async ({ page, api }) => {
    const hoje = diaDoAtelie(0)
    test.skip(!ehDiaUtil(hoje), 'no fim de semana o prazo de hoje recua para sexta e vira atraso: o cenário é de dia útil')
    // Dado que o aviso vence hoje
    await api.criarAviso(nomeUnico('CORREIO ATÉ 17H'), hoje)

    // Quando eu abrir qualquer tela
    const quadro = new PaginaProducao(page)
    await quadro.abrir()

    // Então o item Avisos aparece em vermelho
    const item = quadro.menu('Avisos')
    await expect(item).toHaveAttribute('data-alerta', 'vence_hoje')
    await expect(item).toHaveAttribute('title', /vence hoje/)
  })

  test('Sábado vale a sexta', async ({ page, api }) => {
    // Dado que combinei "até sábado" (o próximo sábado) e que um combinado do sábado passado ficou para trás
    const sabado = proximo(6)
    const sabadoPassado = diaDoAtelieRelativo(sabado, -7)
    const hoje = diaDoAtelie(0)
    const futuro = nomeUnico('ENTREGAR JOGO')
    const passado = nomeUnico('BANDEJA TORTINHA')
    await api.criarAviso(futuro, sabado)
    await api.criarAviso(passado, sabadoPassado)

    const avisos = new PaginaAvisos(page)
    await avisos.abrir()

    // Quando eu abrir o quadro Então o card do próximo sábado está na coluna de sexta, marcado como combinado no sábado
    // (a semana mostrada é a atual; se o sábado cai na semana que vem, navego)
    const sextaDoSabado = diaDoAtelieRelativo(sabado, -1)
    if (diasEntre(hoje, sextaDoSabado) > 5 - diaDaSemana(hoje) && diaDaSemana(hoje) !== 0 && diaDaSemana(hoje) !== 6) {
      await avisos.page.getByRole('button', { name: 'Próxima semana' }).click()
    } else if (diaDaSemana(hoje) === 0 || diaDaSemana(hoje) === 6) {
      await avisos.page.getByRole('button', { name: 'Próxima semana' }).click()
    }
    const card = avisos.cardEm('Sexta', futuro)
    await expect(card).toBeVisible()
    await expect(card).toContainText(`combinado sáb ${ddmm(sabado)}`)
    const faltam = diasEntre(hoje, sextaDoSabado)
    await expect(card).toContainText(faltam === 0 ? 'é hoje' : faltam === 1 ? 'amanhã' : `em ${faltam} dias`)

    // E o do sábado passado está em Atrasado, contando desde a sexta (não desde o sábado)
    await avisos.abrir()
    const atrasado = avisos.cardEm('Atrasado', passado)
    await expect(atrasado).toBeVisible()
    const atraso = diasEntre(diaUtil(sabadoPassado), hoje)
    await expect(atrasado).toContainText(atraso === 1 ? 'atrasado 1 dia' : `atrasado ${atraso} dias`)
    await expect(atrasado).toContainText(`combinado sáb ${ddmm(sabadoPassado)}`)
  })

  test('Concluir não apaga', async ({ page, api }) => {
    const titulo = nomeUnico('LIGAR PARA O CLIENTE')
    await api.criarAviso(titulo, diaDoAtelie(1))
    const avisos = new PaginaAvisos(page)
    await avisos.abrir()

    // Dado que marquei o aviso como feito
    await avisos.marcarFeito(titulo)
    await expect(avisos.card(titulo)).toHaveCount(0)

    // Quando eu abrir a lista de resolvidos Então o aviso aparece com quem concluiu e quando
    const resolvido = avisos.resolvidos().locator('div.rounded-2xl').filter({ hasText: titulo })
    await expect(resolvido).toBeVisible()
    await expect(resolvido).toContainText(/Feito por Gabi em \d{2}\/\d{2}\/\d{4}/)

    // E dá para reabrir se foi engano
    await resolvido.getByRole('button', { name: 'Reabrir' }).click()
    await expect(avisos.card(titulo)).toBeVisible()
    await expect(resolvido).toHaveCount(0)
  })

  test('Virada do dia no fuso do ateliê', async ({ page, api }) => {
    // Dado que o dia do ateliê é o de Novo Hamburgo (UTC-3), não o do servidor
    const hoje = diaDoAtelie(0)
    test.skip(!ehDiaUtil(hoje), 'cenário de dia útil')
    const quadro = await api.get<{ semana: { hoje: string } }>('/avisos')
    expect(quadro.semana.hoje).toBe(hoje)
    // (à noite, depois das 21h, o servidor em UTC já está no dia seguinte e o dia do ateliê não)
    await api.criarAviso(nomeUnico('SAI HOJE'), hoje)

    // Quando o menu consultar o quadro Então o aviso de hoje ainda aparece como "é hoje"
    const avisos = new PaginaAvisos(page)
    await avisos.abrir()
    await expect(avisos.card('SAI HOJE')).toContainText('é hoje')
    await expect(avisos.menu('Avisos')).toHaveAttribute('data-alerta', 'vence_hoje')
  })
})
