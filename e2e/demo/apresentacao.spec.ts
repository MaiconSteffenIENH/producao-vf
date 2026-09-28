import { expect, test } from '../fixtures/teste'
import { diaDoAtelie, nomeUnico } from '../fixtures/dados'
import { PaginaProducao } from '../pages/Producao.page'
import { PaginaForno } from '../pages/Forno.page'
import { PaginaPlanejamento } from '../pages/Planejamento.page'
import { PaginaProntas } from '../pages/Prontas.page'
import { PaginaVendas } from '../pages/Vendas.page'
import { PaginaAvisos } from '../pages/Avisos.page'
import { PaginaInicio } from '../pages/Inicio.page'

/*
 * Roteiro da apresentação (28/09/2026), na ordem em que se conta a história
 * do ateliê: o que produzir, onde cada lote está, o forno como carga, a
 * prateleira e a venda, e o combinado que não se apaga.
 *
 * Os dados são criados pela API antes de cada tela, como nos cenários BDD.
 */
const olhar = (ms: number) => new Promise((r) => setTimeout(r, Math.round(ms * 1.5)))

type Api = Parameters<Parameters<typeof test>[1]>[0]['api']

/** os dados de fundo, iguais nas duas partes: cada parte grava um vídeo próprio */
/*
 * O Chromium sem cabeça responde `navigator.onLine = false`, e a faixa "Sem
 * conexão" apareceria no vídeo inteiro. A rede existe; só o navegador não sabe.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => true }))
})

async function preparar(api: Api) {
  await api.esvaziarFilaDoForno()
  await api.apagarAvisosAbertos()

  // ── dados de fundo: uma peça com histórico, lotes em várias etapas ──
  const bowl = await api.criarPeca(nomeUnico('BOWL DEMO'))
  const pistache = await api.cor('Pistache')
  const branco = await api.cor('Branco')
  // vendas dos três últimos meses fechados: é daí que sai o alvo de estoque
  const hoje = new Date()
  for (const [k, q] of [[1, 52], [2, 48], [3, 56]] as const) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - k, 15))
    await api.registrarVenda(bowl.id, pistache.id, d.toISOString().slice(0, 7), q)
  }
  const emSecagem = await api.criarLote(bowl.id, 40, { iniciadoEm: diaDoAtelie(-6) })
  await api.levarAte(emSecagem, bowl, 'Secagem')
  const parado = await api.criarLote(bowl.id, 12, { iniciadoEm: diaDoAtelie(-3) })
  const paraForno = []
  for (const q of [30, 30, 20]) {
    const l = await api.criarLote(bowl.id, q)
    await api.levarAte(l, bowl, '1ª Queima')
    paraForno.push(l)
  }
  const pronto = await api.criarLote(bowl.id, 15, { iniciadoEm: diaDoAtelie(-30) })
  await api.levarAte(pronto, bowl, 'Pronto', 'Pistache')
  const prontoBranco = await api.criarLote(bowl.id, 8, { iniciadoEm: diaDoAtelie(-20) })
  await api.levarAte(prontoBranco, bowl, 'Pronto', 'Branco')
  await api.criarAviso('Caminhão de argila chega quinta', diaDoAtelie(3))
  await api.criarAviso('Bandeja de tortinha da encomenda da Lú', diaDoAtelie(1))
  return { bowl, emSecagem, parado, paraForno }
}

test('parte 1: início, quadro e forno', async ({ page, api }) => {
  const { emSecagem, parado, paraForno } = await preparar(api)

  // 1. Início: o que precisa de atenção hoje
  const inicio = new PaginaInicio(page)
  await inicio.abrir()
  await expect(page.locator('[data-lotes-parados]')).toContainText(parado.codigo)
  await olhar(4000)

  // 2. Quadro de produção: onde cada lote está, e há quantos dias
  const quadro = new PaginaProducao(page)
  await quadro.abrir()
  await olhar(3000)
  await expect(quadro.cartaoEm('Oleiro', parado.codigo).locator('[data-situacao="atrasado"]')).toBeVisible()
  await quadro.abrirMover(emSecagem.codigo)
  await quadro.preencherMover({ para: '1ª Queima', quantidade: 25 })
  await olhar(1500)
  await quadro.confirmar()
  await quadro.esperarMensagem('Movido.')
  await olhar(2500)
  // perda com motivo
  // o lote agora está em duas colunas: a perda é na Secagem
  await quadro.cartaoEm('Secagem', emSecagem.codigo).getByRole('button', { name: 'Perda' }).click()
  await expect(quadro.janela(`Registrar perda em ${emSecagem.codigo}`)).toBeVisible()
  await quadro.preencherPerda({ quantidade: 2, motivoTipo: 'Trincou na secagem', relato: 'rachou na secagem' })
  await olhar(1500)
  await quadro.confirmar()
  await olhar(2500)

  // 3. Forno como carga: faltam N para fechar, montar, acender, concluir
  const forno = new PaginaForno(page)
  await forno.abrir()
  await olhar(3500)
  await forno.montarFornada('1ª queima (biscoito)')
  const [queima] = await api.queimas('carregando')
  await olhar(1500)
  await forno.acender(queima.codigo)
  await olhar(2000)
  await forno.abrirConclusao(queima.codigo)
  const bloco = forno.loteNaConclusao(paraForno[0].codigo)
  await bloco.getByLabel('Quebrou').fill('3')
  await bloco.getByLabel('O que houve').fill('trincou no forno')
  await olhar(2000)
  await forno.concluir()
  await forno.esperarMensagem(/conclu/i)
  await olhar(2500)
})

test('parte 2: planejamento, prateleira, vendas e avisos', async ({ page, api }) => {
  const { bowl } = await preparar(api)

  // 4. Planejamento: o alvo vem da venda dos três meses fechados
  const plano = new PaginaPlanejamento(page)
  await plano.abrir()
  await olhar(5000)

  // 5. Peças prontas: baixa por venda pede o canal e já entra em Vendas
  const prontas = new PaginaProntas(page)
  await prontas.abrir()
  await olhar(2500)
  await prontas.abrirBaixa(bowl.nome, 'Pistache')
  await prontas.preencherBaixa({ motivo: 'Venda', canal: 'Shopee', quantas: 4 })
  await olhar(1500)
  await prontas.confirmarBaixa()
  await prontas.esperarMensagem(/Baixadas 4/)
  await olhar(2500)

  // 6. Vendas e cobertura
  const vendas = new PaginaVendas(page)
  await vendas.abrir()
  await olhar(4500)

  // 7. Quadro de avisos: o combinado que não se apaga
  const avisos = new PaginaAvisos(page)
  await avisos.abrir()
  await olhar(2500)
  await avisos.novoAviso({ titulo: 'Fotografar os bowls Pistache novos', prazo: diaDoAtelie(2) })
  await olhar(2500)
  await avisos.marcarFeito('Bandeja de tortinha da encomenda da Lú')
  await olhar(3000)

  // 8. de volta ao Início
  await new PaginaInicio(page).abrir()
  await olhar(3000)
})
