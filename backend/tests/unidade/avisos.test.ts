import { describe, expect, it } from 'vitest'
import { lerAviso, ordenarAvisos, resumirQuadro, type EntradaDeAviso } from '../../src/lib/avisos'

/*
 * O fuso do ateliê é UTC-3. Todo instante aqui é escrito em UTC de propósito,
 * porque é assim que o servidor enxerga — e é entre 21h e meia-noite locais que
 * a conta ingênua erra o dia.
 */
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const aviso = (prazo: string | null, concluidoEm: Date | null = null): EntradaDeAviso => ({
  prazo: prazo ? dia(prazo) : null,
  concluidoEm,
})

describe('situação de um aviso', () => {
  const agora = new Date('2026-09-05T12:00:00.000Z') // sexta, 09h no ateliê

  it('prazo de hoje vence hoje', () => {
    expect(lerAviso(aviso('2026-09-05'), agora).situacao).toBe('vence_hoje')
  })

  it('prazo de ontem está atrasado, com a contagem de dias', () => {
    const leitura = lerAviso(aviso('2026-09-03'), agora)
    expect(leitura.situacao).toBe('atrasado')
    expect(leitura.diasDeAtraso).toBe(2)
    expect(leitura.urgencia).toBe('atrasado 2 dias')
  })

  it('um dia de atraso fala no singular', () => {
    expect(lerAviso(aviso('2026-09-04'), agora).urgencia).toBe('atrasado 1 dia')
  })

  it('prazo futuro fica programado e diz quanto falta', () => {
    expect(lerAviso(aviso('2026-09-06'), agora).urgencia).toBe('amanhã')
    expect(lerAviso(aviso('2026-09-11'), agora).urgencia).toBe('em 6 dias')
  })

  it('aviso sem prazo é programado, sem contagem', () => {
    const leitura = lerAviso(aviso(null), agora)
    expect(leitura.situacao).toBe('programado')
    expect(leitura.diasDeAtraso).toBeNull()
  })

  it('concluído vence o prazo vencido: o que foi entregue não atrasa', () => {
    const leitura = lerAviso(aviso('2026-08-01', new Date('2026-07-30T12:00:00.000Z')), agora)
    expect(leitura.situacao).toBe('concluido')
  })
})

/*
 * A ARMADILHA DO FUSO.
 *
 * O backend roda em UTC. Das 21h à meia-noite no ateliê, o servidor já está no
 * dia seguinte. Comparar pela data do servidor mandaria o aviso de hoje para o
 * vermelho de atrasado enquanto a equipe ainda tinha a noite inteira.
 */
describe('a virada do dia é a do ateliê, não a do servidor', () => {
  it('às 22h de sexta no ateliê, o prazo de sexta ainda vence hoje', () => {
    // 2026-09-06T01:00Z = 2026-09-05 22:00 em Novo Hamburgo
    const agora = new Date('2026-09-06T01:00:00.000Z')
    expect(lerAviso(aviso('2026-09-05'), agora).situacao).toBe('vence_hoje')
  })

  it('às 00h30 de sábado no ateliê, o prazo de sexta já atrasou', () => {
    // 2026-09-06T03:30Z = 2026-09-06 00:30 em Novo Hamburgo
    const agora = new Date('2026-09-06T03:30:00.000Z')
    const leitura = lerAviso(aviso('2026-09-05'), agora)
    expect(leitura.situacao).toBe('atrasado')
    expect(leitura.diasDeAtraso).toBe(1)
  })

  it('às 02h da manhã no ateliê, o prazo de hoje ainda é hoje', () => {
    const agora = new Date('2026-09-05T05:00:00.000Z') // 02h no ateliê
    expect(lerAviso(aviso('2026-09-05'), agora).situacao).toBe('vence_hoje')
  })
})

describe('travessia de mês e de ano', () => {
  it('primeiro dia do mês contra o último do anterior', () => {
    const agora = new Date('2026-10-01T12:00:00.000Z')
    expect(lerAviso(aviso('2026-09-30'), agora).diasDeAtraso).toBe(1)
  })

  it('ano novo contra o réveillon', () => {
    const agora = new Date('2027-01-01T12:00:00.000Z')
    expect(lerAviso(aviso('2026-12-31'), agora).diasDeAtraso).toBe(1)
  })
})

describe('estado do quadro para o menu', () => {
  const agora = new Date('2026-09-05T12:00:00.000Z')

  it('quadro vazio não pinta o menu', () => {
    expect(resumirQuadro([], agora).alerta).toBe('nenhum')
  })

  it('só concluídos não pintam o menu', () => {
    const feitos = [aviso('2026-08-01', new Date()), aviso(null, new Date())]
    const resumo = resumirQuadro(feitos, agora)
    expect(resumo.alerta).toBe('nenhum')
    expect(resumo.abertos).toBe(0)
  })

  it('aviso futuro deixa o menu no amarelo', () => {
    expect(resumirQuadro([aviso('2026-09-20')], agora).alerta).toBe('programado')
  })

  it('aviso de hoje deixa o menu no vermelho', () => {
    expect(resumirQuadro([aviso('2026-09-20'), aviso('2026-09-05')], agora).alerta).toBe('vence_hoje')
  })

  it('um atrasado manda em todos os outros: alerta não faz média', () => {
    const quadro = [aviso('2026-09-20'), aviso('2026-09-05'), aviso('2026-09-01')]
    const resumo = resumirQuadro(quadro, agora)
    expect(resumo.alerta).toBe('atrasado')
    expect(resumo.abertos).toBe(3)
    expect(resumo.venceHoje).toBe(1)
    expect(resumo.atrasados).toBe(1)
    expect(resumo.piorAtraso).toBe(4)
  })

  it('o pior atraso é o maior, não o último encontrado', () => {
    const quadro = [aviso('2026-08-20'), aviso('2026-09-04')]
    expect(resumirQuadro(quadro, agora).piorAtraso).toBe(16)
  })

  it('aviso sem prazo conta como aberto e mantém o amarelo', () => {
    const resumo = resumirQuadro([aviso(null)], agora)
    expect(resumo.alerta).toBe('programado')
    expect(resumo.abertos).toBe(1)
  })
})

describe('ordem do quadro', () => {
  const agora = new Date('2026-09-05T12:00:00.000Z')

  it('atrasado primeiro, depois hoje, depois programado, e concluído por último', () => {
    const programado = aviso('2026-09-20')
    const hoje = aviso('2026-09-05')
    const atrasado = aviso('2026-09-01')
    const feito = aviso('2026-09-02', new Date())

    const ordem = ordenarAvisos([programado, feito, hoje, atrasado], agora)
    expect(ordem).toEqual([atrasado, hoje, programado, feito])
  })

  it('dentro do grupo, o mais atrasado vem antes', () => {
    const doisDias = aviso('2026-09-03')
    const dezDias = aviso('2026-08-26')
    expect(ordenarAvisos([doisDias, dezDias], agora)).toEqual([dezDias, doisDias])
  })

  it('entre programados, o prazo mais próximo vem antes e o sem data fecha a lista', () => {
    const semData = aviso(null)
    const longe = aviso('2026-10-30')
    const perto = aviso('2026-09-08')
    expect(ordenarAvisos([semData, longe, perto], agora)).toEqual([perto, longe, semData])
  })

  it('não altera o array recebido', () => {
    const original = [aviso('2026-09-20'), aviso('2026-09-01')]
    const copia = [...original]
    ordenarAvisos(original, agora)
    expect(original).toEqual(copia)
  })
})
