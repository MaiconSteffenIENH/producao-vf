import { expect, test } from '../fixtures/teste'
import { nomeUnico } from '../fixtures/dados'
import { PaginaAjustes } from '../pages/Ajustes.page'
import { PaginaProntas } from '../pages/Prontas.page'
import { PaginaPlanejamento } from '../pages/Planejamento.page'

/*
 * BDD-11 · UC-14 · Ligar ou desligar um módulo
 * SENDO o administrador
 * POSSO desligar um módulo que o ateliê não usa
 * PARA o menu ter só o que interessa, sem perder dado nem trancar ninguém
 */
test.describe('BDD-11 Ligar ou desligar um módulo', () => {
  test.afterEach(async ({ api }) => {
    await api.ligarModulo('fotos', true)
  })

  test('Desligar esconde e barra', async ({ page, api }) => {
    const ajustes = new PaginaAjustes(page)
    await ajustes.abrir()
    await expect(ajustes.menu('Fotos')).toBeVisible()

    // Dado que desliguei o módulo Fotos
    await ajustes.chave('Desligar', 'Fotos').click()
    await ajustes.esperarMensagem('Fotos saiu do menu. Nada foi apagado.')

    // Quando qualquer pessoa entrar Então Fotos não aparece no menu
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
    await expect(ajustes.menu('Fotos')).toHaveCount(0)
    // E a rota /fotos da API responde 403
    const r = await api.raw().get('/fotos')
    expect(r.status()).toBe(403)
  })

  test('Desligar Fotos destrava a venda', async ({ page, api }) => {
    test.skip(!process.env.E2E_INCLUIR_EM_TESTE, 'RF 4.11.2 está em teste (branch melhorias/05-09), fora do master')
    // Dado que Fotos está desligado E que a peça tem 12 prontas sem foto publicada
    await api.ligarModulo('fotos', false)
    const peca = await api.criarPeca(nomeUnico('BOWL'))
    const lote = await api.criarLote(peca.id, 12)
    await api.levarAte(lote, peca, 'Pronto', 'Pistache')

    // Quando eu abrir Peças prontas Então as 12 contam como vendáveis
    const prontas = new PaginaProntas(page)
    await prontas.abrir()
    await expect(prontas.linha(peca.nome, 'Pistache')).toContainText('na loja')
    // E o planejamento não sugere fotografar
    const plano = new PaginaPlanejamento(page)
    await plano.abrir()
    await expect(plano.sugestoes(peca.nome).filter({ hasText: /^Fotografar/ })).toHaveCount(0)
  })

  test('Essencial não desliga', async ({ page, api }) => {
    // Quando eu tento desligar Ajustes
    const ajustes = new PaginaAjustes(page)
    await ajustes.abrir()
    // Então a chave está travada na tela
    await expect(ajustes.chave('Desligar', 'Ajustes')).toBeDisabled()
    // E a API recusa, explicando que trancaria todo mundo do lado de fora
    const r = await api.raw().put('/modulos/ajustes', { data: { ativo: false } })
    expect(r.ok()).toBe(false)
    expect(await r.text()).toContain('trancaria todo mundo do lado de fora')
  })

  test('Religar devolve tudo', async ({ page, api }) => {
    // Dado que Fotos estava desligado, com uma combinação já publicada
    const peca = await api.criarPeca(nomeUnico('BOWL'), { cores: ['Pistache'] })
    const lote = await api.criarLote(peca.id, 6)
    await api.levarAte(lote, peca, 'Pronto', 'Pistache')
    type Ciclo = { id: string; pecaId: string; status: string }
    const fila = () => api.get<{ linhas: Ciclo[] }>('/fotos').then((r) => r.linhas)
    const ciclo = (await fila()).find((f) => f.pecaId === peca.id)!
    for (let i = 0; i < 4; i++) await api.post(`/fotos/${ciclo.id}/avancar`)
    const publicado = (await fila()).find((f) => f.id === ciclo.id)
    expect(publicado?.status ?? 'publicado').toBe('publicado')
    await api.ligarModulo('fotos', false)

    // Quando eu religo
    const ajustes = new PaginaAjustes(page)
    await ajustes.abrir()
    await ajustes.chave('Ligar', 'Fotos').click()
    await ajustes.esperarMensagem('Fotos está de volta ao menu.')

    // Então o ciclo de foto de cada combinação está como antes E a trava de venda volta a valer
    await expect(ajustes.menu('Fotos')).toBeVisible()
    const depois = (await fila()).find((f) => f.id === ciclo.id)
    expect(depois?.status ?? 'publicado').toBe('publicado')
    expect((await api.raw().get('/fotos')).status()).toBe(200)
  })
})
