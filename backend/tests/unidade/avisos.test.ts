import { describe, expect, it } from 'vitest'
import {
  diaUtilDoPrazo,
  diasUteisDaSemana,
  lerAviso,
  ordenarAvisos,
  posicaoNoQuadro,
  resumirQuadro,
  segundaDaSemana,
  type EntradaDeAviso,
} from '../../src/lib/avisos'

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

/*
 * O QUADRO POR DIA DA SEMANA.
 *
 * 2026-09-07 é uma segunda-feira. Toda data usada aqui foi conferida contra o
 * calendário: teste de dia da semana que erra o calendário passa a validar o
 * próprio engano.
 */
describe('a semana do quadro', () => {
  it('acha a segunda a partir de qualquer dia dela', () => {
    expect(segundaDaSemana('2026-09-07')).toBe('2026-09-07') // a própria segunda
    expect(segundaDaSemana('2026-09-09')).toBe('2026-09-07') // quarta
    expect(segundaDaSemana('2026-09-11')).toBe('2026-09-07') // sexta
  })

  it('sábado e domingo ainda pertencem à semana que começou na segunda', () => {
    expect(segundaDaSemana('2026-09-12')).toBe('2026-09-07') // sábado
    expect(segundaDaSemana('2026-09-13')).toBe('2026-09-07') // domingo
  })

  it('atravessa a virada do mês', () => {
    expect(segundaDaSemana('2026-10-01')).toBe('2026-09-28') // quinta → segunda anterior
  })

  it('a semana tem cinco dias úteis, de segunda a sexta', () => {
    expect(diasUteisDaSemana('2026-09-07')).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
    ])
  })
})

describe('prazo de fim de semana recua para a sexta', () => {
  it('sábado vira a sexta anterior', () => {
    expect(diaUtilDoPrazo('2026-09-12')).toBe('2026-09-11')
  })

  it('domingo vira a sexta anterior, e não a segunda seguinte', () => {
    // empurrar para a frente daria dois dias de prazo que não existem
    expect(diaUtilDoPrazo('2026-09-13')).toBe('2026-09-11')
  })

  it('dia útil não se mexe', () => {
    for (const dia of ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']) {
      expect(diaUtilDoPrazo(dia)).toBe(dia)
    }
  })

  it('domingo que começa o mês recua para a sexta do mês anterior', () => {
    expect(diaUtilDoPrazo('2026-11-01')).toBe('2026-10-30')
  })
})

describe('em que coluna o aviso aparece', () => {
  const segunda = '2026-09-07'
  // sexta da semana anterior, às 09h no ateliê: tudo desta semana está no futuro
  const agora = new Date('2026-09-04T12:00:00.000Z')

  it('cada dia útil cai na sua coluna', () => {
    expect(posicaoNoQuadro(aviso('2026-09-07'), segunda, agora)?.coluna).toBe('seg')
    expect(posicaoNoQuadro(aviso('2026-09-09'), segunda, agora)?.coluna).toBe('qua')
    expect(posicaoNoQuadro(aviso('2026-09-11'), segunda, agora)?.coluna).toBe('sex')
  })

  it('sábado aparece na sexta, marcado como recuado', () => {
    const p = posicaoNoQuadro(aviso('2026-09-12'), segunda, agora)
    expect(p?.coluna).toBe('sex')
    expect(p?.dia).toBe('2026-09-11')
    expect(p?.recuadoDoFimDeSemana).toBe(true)
  })

  it('dia útil não é marcado como recuado', () => {
    expect(posicaoNoQuadro(aviso('2026-09-09'), segunda, agora)?.recuadoDoFimDeSemana).toBe(false)
  })

  it('aviso sem data fica na coluna própria, e não some', () => {
    const p = posicaoNoQuadro(aviso(null), segunda, agora)
    expect(p?.coluna).toBe('sem_data')
    expect(p?.dia).toBeNull()
  })

  it('concluído sai do quadro', () => {
    expect(posicaoNoQuadro(aviso('2026-09-09', new Date()), segunda, agora)).toBeNull()
  })

  it('aviso de outra semana não aparece nesta, mas continua existindo', () => {
    expect(posicaoNoQuadro(aviso('2026-09-16'), segunda, agora)).toBeNull()
    expect(posicaoNoQuadro(aviso('2026-09-16'), '2026-09-14', agora)?.coluna).toBe('qua')
  })

  /*
   * Atrasado vence o dia da semana. Um aviso de terça que já passou não pode
   * ficar deitado na coluna de terça como se ainda houvesse tempo.
   */
  it('o que passou do prazo vai para a coluna de atrasado', () => {
    const naQuarta = new Date('2026-09-09T12:00:00.000Z')
    const p = posicaoNoQuadro(aviso('2026-09-08'), segunda, naQuarta)
    expect(p?.coluna).toBe('atrasado')
    expect(p?.dia).toBeNull()
  })

  it('o de hoje continua na coluna de hoje, não no atrasado', () => {
    const naQuarta = new Date('2026-09-09T12:00:00.000Z')
    expect(posicaoNoQuadro(aviso('2026-09-09'), segunda, naQuarta)?.coluna).toBe('qua')
  })

  it('atrasado aparece mesmo olhando outra semana: ele não pode sumir', () => {
    const naQuarta = new Date('2026-09-09T12:00:00.000Z')
    expect(posicaoNoQuadro(aviso('2026-08-20'), '2026-09-14', naQuarta)?.coluna).toBe('atrasado')
  })
})
