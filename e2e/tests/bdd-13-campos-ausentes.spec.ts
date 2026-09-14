import { expect, test } from '../fixtures/teste'
import { nomeUnico } from '../fixtures/dados'
import { PaginaPecas } from '../pages/Pecas.page'
import type { Peca } from '../fixtures/api'

/** o corpo que a TELA ANTIGA manda: só o que ela conhece (sem ficha técnica, sem insumos) */
function corpoDaTelaAntiga(peca: Peca) {
  return {
    nome: peca.nome,
    categoriaId: peca.categoriaId,
    tempoMedioDias: peca.tempoMedioDias,
    qtdMinimaDesejada: peca.qtdMinimaDesejada,
    roteiro: peca.roteiro.map((r) => ({ etapaId: r.etapaId, ordem: r.ordem, diasEstimados: r.diasEstimados ?? 1 })),
    cores: peca.cores.map((c) => ({ corId: c.corId, qtdMinimaDesejada: 0 })),
    ativo: true,
  }
}
/** o corpo que a tela NOVA manda: tudo, inclusive o que está nulo de propósito */
function corpoDaTelaNova(peca: Peca, mudancas: Record<string, unknown>) {
  return {
    ...corpoDaTelaAntiga(peca),
    alturaCm: peca.alturaCm, larguraCm: peca.larguraCm, diametroBocaCm: peca.diametroBocaCm, diametroBaseCm: peca.diametroBaseCm,
    capacidadeMl: peca.capacidadeMl, pesoCruG: peca.pesoCruG, medidasMomento: peca.medidasMomento, medidaToleranciaPct: peca.medidaToleranciaPct,
    argilaId: peca.argilaId,
    insumos: (peca.insumos as { materiaPrimaId: string; quantidadePorPeca: number }[]).map((i) => ({ materiaPrimaId: i.materiaPrimaId, quantidadePorPeca: Number(i.quantidadePorPeca) })),
    ...mudancas,
  }
}

/*
 * BDD-13 · UC-11 · Campos ausentes no cadastro de peça
 * SENDO um celular com a tela antiga em cache
 * POSSO salvar a peça sem conhecer os campos novos
 * PARA não apagar o que outra pessoa preencheu depois da publicação
 *
 * O "celular antigo" é simulado pela API: é exatamente o corpo que a versão
 * anterior da tela envia. A conferência é feita na tela nova.
 */
test.describe('BDD-13 Campos ausentes no cadastro de peça', () => {
  test('Campo ausente não é tocado', async ({ page, api }) => {
    // Dado que a Gabi preencheu a ficha técnica no computador
    const criada = await api.criarPeca(nomeUnico('XÍCARA'))
    await api.put(`/pecas/${criada.id}`, corpoDaTelaNova(criada, { alturaCm: 10.5, medidasMomento: 'cru', medidaToleranciaPct: 5 }))
    const comFicha = await api.peca(criada.id)
    expect(Number(comFicha.alturaCm)).toBe(10.5)

    // E que o celular do João ainda tem a tela sem ficha técnica Quando o João salva a mesma peça pelo celular
    await api.put(`/pecas/${criada.id}`, corpoDaTelaAntiga(comFicha))

    // Então a ficha técnica continua como a Gabi deixou
    const pecas = new PaginaPecas(page)
    await pecas.abrir()
    await pecas.editar(criada.nome)
    await expect(pecas.janelaDaPeca.getByLabel('Altura (cm)')).toHaveValue('10,5')
    await expect(pecas.janelaDaPeca.getByLabel('Momento da medição')).toHaveValue('cru')
  })

  test('Nulo explícito limpa', async ({ page, api }) => {
    // Dado que a peça tem argila cadastrada
    const argila = (await api.get<{ id: string; nome: string; tipo: string }[]>('/materias-primas')).find((m) => m.tipo === 'argila')!
    const criada = await api.criarPeca(nomeUnico('XÍCARA'))
    await api.put(`/pecas/${criada.id}`, corpoDaTelaNova(criada, { argilaId: argila.id }))
    expect((await api.peca(criada.id)).argilaId).toBe(argila.id)

    // Quando eu limpo o campo de argila na tela nova e salvo
    const pecas = new PaginaPecas(page)
    await pecas.abrir()
    await pecas.editar(criada.nome)
    const campo = pecas.janelaDaPeca.getByRole('combobox', { name: /Argila|não definida/ }).first()
    await expect(campo).toHaveValue(argila.nome)
    await pecas.janelaDaPeca.getByRole('button', { name: 'Limpar' }).first().click()
    await expect(campo).toHaveValue('')
    await pecas.salvar()
    await pecas.esperarMensagem('Peça atualizada.')

    // Então a argila é removida, porque ausente é "não mexa" e nulo é "limpei"
    expect((await api.peca(criada.id)).argilaId).toBeNull()
  })

  test('Lista de insumos ausente', async ({ page, api }) => {
    // Dado que a peça tem três insumos cadastrados
    const materias = await api.get<{ id: string; nome: string }[]>('/materias-primas')
    expect(materias.length).toBeGreaterThanOrEqual(3)
    const criada = await api.criarPeca(nomeUnico('XÍCARA'))
    await api.put(`/pecas/${criada.id}`, corpoDaTelaNova(criada, {
      insumos: materias.slice(0, 3).map((m, i) => ({ materiaPrimaId: m.id, quantidadePorPeca: i + 1 })),
    }))
    const comInsumos = await api.peca(criada.id)
    expect(comInsumos.insumos).toHaveLength(3)

    // Quando uma tela antiga salva sem mandar a lista
    await api.put(`/pecas/${criada.id}`, corpoDaTelaAntiga(comInsumos))

    // Então os três insumos permanecem
    expect((await api.peca(criada.id)).insumos).toHaveLength(3)
    const pecas = new PaginaPecas(page)
    await pecas.abrir()
    await pecas.editar(criada.nome)
    const resumo = pecas.janelaDaPeca.locator('summary', { hasText: 'Outros insumos' })
    await expect(resumo).toHaveText('Outros insumos (3)')
    await resumo.click()
    await expect(pecas.janelaDaPeca.getByRole('button', { name: 'Remover insumo' })).toHaveCount(3)
  })
})
