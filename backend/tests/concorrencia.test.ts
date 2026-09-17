import { beforeAll, describe, expect, it } from 'vitest'
import { comAuth } from './helpers'

/**
 * Duas gravações no MESMO lote ao mesmo tempo: o caso real é dois celulares
 * reenviando a fila offline quando o sinal volta. Antes da trava, as duas liam
 * "10 disponíveis" e o livro-razão ficava com 20 saídas de um saldo de 10.
 *
 * O saldo não é campo, é soma: um erro desses não se apaga, se corrige com
 * estorno à mão. Por isso o teste é contra o banco de verdade, com requisições
 * de fato em paralelo, e não contra um mock.
 */
describe('concorrência no livro-razão', () => {
  let pecaId = ''
  let etapas: { id: string; nome: string }[] = []
  const id = (nome: string) => etapas.find((e) => e.nome === nome)!.id

  beforeAll(async () => {
    const [ps, es] = await Promise.all([comAuth('get', '/pecas?ativo=true'), comAuth('get', '/etapas')])
    pecaId = ps.body.find((p: { nome: string }) => p.nome === 'Tortinha').id
    etapas = es.body
  })

  async function novoLote(quantidade: number) {
    const r = await comAuth('post', '/lotes', { pecaId, quantidade })
    expect(r.status).toBe(201)
    return r.body.id as string
  }

  async function saldos(loteId: string) {
    const r = await comAuth('get', `/lotes/${loteId}`)
    const porEtapa = new Map<string, number>()
    for (const m of r.body.movimentos as { etapaOrigemId: string | null; etapaDestinoId: string | null; quantidade: number }[]) {
      if (m.etapaDestinoId) porEtapa.set(m.etapaDestinoId, (porEtapa.get(m.etapaDestinoId) ?? 0) + m.quantidade)
      if (m.etapaOrigemId) porEtapa.set(m.etapaOrigemId, (porEtapa.get(m.etapaOrigemId) ?? 0) - m.quantidade)
    }
    return { porEtapa, movimentos: r.body.movimentos.length as number }
  }

  it('dois avanços simultâneos do mesmo saldo: um grava, o outro recebe 409, e o saldo fecha', async () => {
    const loteId = await novoLote(10)
    const corpo = { etapaOrigemId: id('Equipe Vera'), etapaDestinoId: id('Secagem'), quantidade: 10 }

    const [a, b] = await Promise.all([
      comAuth('post', `/lotes/${loteId}/avancar`, corpo),
      comAuth('post', `/lotes/${loteId}/avancar`, corpo),
    ])

    expect([a.status, b.status].sort()).toEqual([200, 409])
    const recusada = a.status === 409 ? a : b
    expect(recusada.body.mensagem).toContain('Só há 0')

    const { porEtapa } = await saldos(loteId)
    expect(porEtapa.get(id('Equipe Vera'))).toBe(0)
    expect(porEtapa.get(id('Secagem'))).toBe(10)
  })

  it('o mesmo reenvio da fila em paralelo grava UMA vez e responde igual nas duas', async () => {
    const loteId = await novoLote(10)
    const corpo = {
      etapaOrigemId: id('Equipe Vera'),
      etapaDestinoId: id('Secagem'),
      quantidade: 4,
      chaveIdempotencia: `teste-concorrencia-${loteId}`,
    }

    const [a, b] = await Promise.all([
      comAuth('post', `/lotes/${loteId}/avancar`, corpo),
      comAuth('post', `/lotes/${loteId}/avancar`, corpo),
    ])

    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(a.body.movimento.id).toBe(b.body.movimento.id)

    const { porEtapa, movimentos } = await saldos(loteId)
    expect(movimentos).toBe(2) // a entrada inicial e um único avanço
    expect(porEtapa.get(id('Equipe Vera'))).toBe(6)
    expect(porEtapa.get(id('Secagem'))).toBe(4)
  })

  it('perda e avanço disputando as mesmas peças: só passa o que o saldo cobre', async () => {
    const loteId = await novoLote(10)
    const origem = id('Equipe Vera')

    const [avanco, perda] = await Promise.all([
      comAuth('post', `/lotes/${loteId}/avancar`, {
        etapaOrigemId: origem,
        etapaDestinoId: id('Secagem'),
        quantidade: 7,
      }),
      comAuth('post', `/lotes/${loteId}/perda`, {
        etapaId: origem,
        quantidade: 7,
        motivo: 'caiu da prateleira',
        motivoTipo: 'quebra_manuseio',
      }),
    ])

    expect([avanco.status, perda.status].sort()).toEqual([200, 409])
    const { porEtapa } = await saldos(loteId)
    expect(porEtapa.get(origem)).toBe(3)
  })
})
