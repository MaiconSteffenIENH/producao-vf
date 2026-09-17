import { beforeAll, describe, expect, it } from 'vitest'
import { comAuth } from './helpers'
import { competenciaDe } from '../src/lib/cobertura'

/**
 * A baixa por venda na tela de Prontas É a venda: soma na linha peça+cor+canal
 * do mês do ateliê e a baixa sai pelo mesmo caminho da tela de Vendas. Antes,
 * a baixa tirava do estoque e a venda ficava para "depois lançar", e a
 * cobertura via menos venda do que houve.
 */
describe('baixa por venda na prateleira', () => {
  let pecaId = ''
  let corId = ''
  let shopeeId = ''
  let etapas: { id: string; nome: string; defineCor: boolean }[] = []
  const id = (nome: string) => etapas.find((e) => e.nome === nome)!.id
  const competencia = competenciaDe(new Date())

  beforeAll(async () => {
    const [ps, es, cs, canais] = await Promise.all([
      comAuth('get', '/pecas?ativo=true'),
      comAuth('get', '/etapas'),
      comAuth('get', '/cores'),
      comAuth('get', '/canais'),
    ])
    etapas = es.body
    corId = cs.body.find((c: { nome: string }) => c.nome === 'Pistache').id
    shopeeId = canais.body.find((c: { nome: string }) => c.nome === 'Shopee').id

    // uma peça só desta bateria, com 20 prontas em Pistache
    const peca = await comAuth('post', '/pecas', {
      nome: 'CANECA TESTE PRATELEIRA',
      categoriaId: ps.body[0].categoriaId,
      qtdMinimaDesejada: 5,
      roteiro: ['Equipe Vera', 'Secagem', '1ª Queima', 'Biscoito', 'Esmaltação', '2ª Queima', 'Pronto'].map((n) => ({
        etapaId: id(n),
      })),
      cores: [{ corId }],
    })
    expect(peca.status).toBe(201)
    pecaId = peca.body.id
    const lote = await comAuth('post', '/lotes', { pecaId, quantidade: 20 })
    const caminho = ['Equipe Vera', 'Secagem', '1ª Queima', 'Biscoito', 'Esmaltação', '2ª Queima', 'Pronto']
    for (let i = 0; i < caminho.length - 1; i++) {
      const destino = etapas.find((e) => e.nome === caminho[i + 1])!
      const r = await comAuth('post', `/lotes/${lote.body.id}/avancar`, {
        etapaOrigemId: id(caminho[i]),
        etapaDestinoId: destino.id,
        quantidade: 20,
        corId: destino.defineCor ? corId : undefined,
      })
      expect(r.status, `${caminho[i]} → ${caminho[i + 1]}: ${JSON.stringify(r.body)}`).toBe(200)
    }
  })

  const vendaDoMes = async () => {
    const r = await comAuth('get', `/vendas?competencia=${competencia}&pecaId=${pecaId}`)
    return r.body.find((v: { canalId: string | null }) => v.canalId === shopeeId) as { quantidade: number } | undefined
  }

  it('venda sem canal é recusada, e nada sai do estoque', async () => {
    const r = await comAuth('post', '/estoque/prontas/baixa', { pecaId, corId, quantidade: 3, motivoTipo: 'venda' })
    expect(r.status).toBe(422)
    expect(r.body.mensagem).toContain('canal')
    expect(await vendaDoMes()).toBeUndefined()
  })

  it('venda com canal soma na linha do mês e dá a baixa', async () => {
    const r = await comAuth('post', '/estoque/prontas/baixa', {
      pecaId,
      corId,
      quantidade: 3,
      motivoTipo: 'venda',
      canalId: shopeeId,
    })
    expect(r.status).toBe(200)
    expect(r.body.baixado).toBe(3)
    expect(r.body.venda).toMatchObject({ canal: 'Shopee', competencia, quantidadeNoMes: 3 })
    expect((await vendaDoMes())?.quantidade).toBe(3)
  })

  it('segunda venda no mesmo mês acumula, em vez de abrir outra linha', async () => {
    const r = await comAuth('post', '/estoque/prontas/baixa', {
      pecaId,
      corId,
      quantidade: 2,
      motivoTipo: 'venda',
      canalId: shopeeId,
    })
    expect(r.status).toBe(200)
    expect(r.body.venda.quantidadeNoMes).toBe(5)
    expect((await vendaDoMes())?.quantidade).toBe(5)
  })

  it('o reenvio da fila com a mesma chave não soma de novo nem baixa de novo', async () => {
    const corpo = {
      pecaId,
      corId,
      quantidade: 4,
      motivoTipo: 'venda',
      canalId: shopeeId,
      chaveIdempotencia: `prateleira-teste-${pecaId}`,
    }
    const primeira = await comAuth('post', '/estoque/prontas/baixa', corpo)
    const segunda = await comAuth('post', '/estoque/prontas/baixa', corpo)
    expect(primeira.status).toBe(200)
    expect(segunda.status).toBe(200)
    expect(segunda.body.baixado).toBe(4)
    expect((await vendaDoMes())?.quantidade).toBe(9)

    const prontas = await comAuth('get', '/estoque/prontas')
    const grupo = prontas.body.grupos.find((g: { pecaId: string }) => g.pecaId === pecaId)
    const linha = grupo.linhas.find((l: { corId: string | null }) => l.corId === corId)
    expect(linha.prontas).toBe(20 - 9)
  })

  it('brinde continua sem virar venda', async () => {
    const r = await comAuth('post', '/estoque/prontas/baixa', { pecaId, corId, quantidade: 1, motivoTipo: 'brinde' })
    expect(r.status).toBe(200)
    expect(r.body.venda).toBeUndefined()
    expect((await vendaDoMes())?.quantidade).toBe(9)
  })

  it('feira já não é motivo', async () => {
    const r = await comAuth('post', '/estoque/prontas/baixa', { pecaId, corId, quantidade: 1, motivoTipo: 'feira' })
    expect(r.status).toBe(422)
    expect(r.body.mensagem).toContain('não é um motivo de saída conhecido')
  })
})
