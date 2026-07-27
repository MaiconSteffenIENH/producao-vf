import { prisma } from '../lib/prisma'
import { calcularEstoque } from './estoque.service'
import { plural, pluralNome } from '../lib/plural'
import { alocarBiscoito, perdaDaPeca, quantidadeComPerda } from '../lib/planejamento-calculo'
import { calcularCobertura, competenciaDe, type VendaMensal } from '../lib/cobertura'
import { preverConclusao, semanasParaRepor, type EtapaDoRoteiro } from '../lib/previsao'
import { necessidadeDeInsumos, type ConsumoDeInsumo, type EstoqueDeInsumo } from '../lib/insumos'
import { filaDasQueimas } from './queima.service'

/*
 * O módulo que a Gabi chamou de mais importante. Ele responde "o que produzir"
 * cruzando o mínimo desejado, o que já existe e o que já está a caminho. Sem
 * descontar o que está a caminho, o sistema mandaria produzir de novo tudo que
 * ainda está secando — e o ateliê afogaria.
 *
 * A saída segue o formato que a Gabi escreveu:
 *   Produzir 50 Xícaras Andorinha
 *   Esmaltar 20 peças Pistache
 *   Comprar mais esmalte
 *
 * O QUE MUDOU, e por quê:
 *
 * 1. A quantidade INFLA pela perda. Antes o plano dizia "faltam 50" e mandava
 *    produzir 50; com 12% de perda saem 44. Toda vez, para menos. O custo já
 *    sabia disso (precificacao.ts); o plano não usava.
 * 2. O biscoito é ALOCADO com saldo corrente. Antes 20 peças em estoque viravam
 *    sugestão de esmaltar 20 em Pistache, 20 em Coral e 20 em Búzios — 60 a
 *    partir de 20. A Vera abria três lotes e descobria na bancada.
 * 3. ENCOMENDA vem antes de estoque: tem cliente e tem data.
 * 4. VENDA vira alarme de ruptura, não só relatório. Sem ela o mínimo era um
 *    chute que ninguém revisava.
 * 5. O FORNO entra com "faltam N para fechar a carga" — a sugestão que muda a
 *    ordem do dia e que nenhum ateliê calcula de cabeça.
 * 6. FOTO entra como etapa: peça pronta sem foto não é peça vendável.
 * 7. INSUMO vira previsão do plano, não reação ao mínimo.
 */

export type Sugestao = {
  tipo: 'produzir' | 'esmaltar' | 'comprar' | 'queimar' | 'fotografar' | 'encomenda'
  titulo: string
  detalhe: string
  quantidade: number
  /** 0 = encomenda com prazo; 1 = urgente; 2 = importante; 3 = manutenção */
  prioridade: number
  pecaId?: string
  pecaNome?: string
  corId?: string
  corNome?: string
  corHex?: string
  materiaPrimaId?: string
  encomendaId?: string
  queimaTipo?: string
  /** nao_iniciada | em_andamento | parcial | concluida */
  situacao: string
  situacaoDetalhe: string
  /** "entre 21 e 33 dias", quando dá para estimar */
  previsao?: string
  /** o que a perda acrescentou à quantidade crua */
  ajustePerda?: { comecar: number; entregar: number; percentual: number; origem: string }
}

/*
 * Formatos crus do Prisma, declarados à mão.
 *
 * O ambiente onde este código foi escrito não alcança binaries.prisma.sh, então
 * o Prisma Client não é gerado e o TypeScript perde a inferência. Declarar os
 * formatos aqui devolve a checagem — e, de quebra, deixa explícito o que cada
 * consulta realmente traz.
 */
type PecaCrua = {
  id: string
  nome: string
  qtdMinimaDesejada: number
  qtdMinimaBiscoito: number
  cores: {
    corId: string
    qtdMinimaDesejada: number
    fotoStatus: string
    cor: { id: string; nome: string; hex: string }
  }[]
  roteiro: {
    ordem: number
    diasEstimados: number
    etapa: {
      id: string
      nome: string
      defineCor: boolean
      estoqueIntermediario: boolean
      aguardaCarga: boolean
    }
  }[]
  custo: { perdaEstimadaPercentual: unknown } | null
}

type MateriaCrua = {
  id: string
  nome: string
  unidade: string
  estoqueAtual: unknown
  estoqueMinimo: unknown
  prazoEntregaDias: number
}

type PedidoDeCorLocal = {
  corId: string
  corNome: string
  corHex: string
  faltam: number
  prontas: number
  aCaminho: number
  minimoDaCor: number
  fotoStatus: string
}

const faixaDe = (min: number, max: number) =>
  max === 0 ? undefined : min === max ? `cerca de ${min} dias` : `entre ${min} e ${max} dias`

const dataBr = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/')

export async function sugerir(
  agora = new Date(),
): Promise<{ sugestoes: Sugestao[]; resumo: Record<string, number> }> {
  const [pecas, materias, estoque, insumosCadastrados, vendas, encomendas, filaQueimas] =
    await Promise.all([
      prisma.peca.findMany({
        where: { ativo: true },
        include: {
          cores: { where: { ativo: true }, include: { cor: true } },
          roteiro: {
            include: {
              etapa: {
                select: {
                  id: true,
                  nome: true,
                  defineCor: true,
                  estoqueIntermediario: true,
                  aguardaCarga: true,
                },
              },
            },
          },
          custo: { select: { perdaEstimadaPercentual: true } },
        },
      }),
      prisma.materiaPrima.findMany({ where: { ativo: true } }),
      calcularEstoque(),
      prisma.pecaInsumo.findMany(),
      prisma.venda.findMany({
        select: { pecaId: true, corId: true, competencia: true, quantidade: true },
      }),
      prisma.encomenda.findMany({
        where: { status: { in: ['aberta', 'em_producao'] } },
        include: { itens: { include: { peca: true, cor: true } } },
      }),
      filaDasQueimas(agora),
    ])

  const lotesAbertos = await prisma.lote.groupBy({
    by: ['pecaId'],
    where: { canceladoEm: null, concluidoEm: null },
    _count: { _all: true },
  })
  const temLoteAberto = new Set(lotesAbertos.map((l: { pecaId: string }) => l.pecaId))

  /*
   * Perda REAL por peça, tirada do livro-razão. É agregado no banco de
   * propósito: trazer movimento por movimento para somar em JS carregaria o
   * histórico inteiro do ateliê a cada abertura da tela de planejamento.
   */
  const perdasBrutas = await prisma.$queryRaw<{ peca_id: string; tipo: string; total: bigint }[]>`
    select l.peca_id, m.tipo, sum(m.quantidade)::bigint as total
    from movimentos_lote m
    join lotes l on l.id = m.lote_id
    where m.tipo in ('inicio', 'perda')
    group by l.peca_id, m.tipo
  `
  const movimentosDaPeca = new Map<string, { tipo: string; quantidade: number }[]>()
  for (const linha of perdasBrutas) {
    const lista = movimentosDaPeca.get(linha.peca_id) ?? []
    lista.push({ tipo: linha.tipo, quantidade: Number(linha.total) })
    movimentosDaPeca.set(linha.peca_id, lista)
  }

  const vendasDaPeca = new Map<string, VendaMensal[]>()
  const vendasDaPecaCor = new Map<string, VendaMensal[]>()
  for (const v of vendas) {
    const item = { competencia: v.competencia, quantidade: v.quantidade }
    const daPeca = vendasDaPeca.get(v.pecaId) ?? []
    daPeca.push(item)
    vendasDaPeca.set(v.pecaId, daPeca)
    if (v.corId) {
      const chave = `${v.pecaId}:${v.corId}`
      const daCor = vendasDaPecaCor.get(chave) ?? []
      daCor.push(item)
      vendasDaPecaCor.set(chave, daCor)
    }
  }

  const competencia = competenciaDe(agora)
  const sugestoes: Sugestao[] = []
  /** o que o plano vai consumir de insumo — alimentado ao longo das sugestões */
  const planoParaInsumos: { pecaId: string; corId: string | null; quantidade: number }[] = []

  // ── 0. ENCOMENDA vem primeiro: tem cliente e tem data ─────────────
  for (const enc of encomendas) {
    for (const item of enc.itens) {
      if (item.quantidade <= 0) continue
      const prazo = enc.entregarAte ? ` Entregar até ${dataBr(enc.entregarAte)}.` : ''
      sugestoes.push({
        tipo: 'encomenda',
        titulo:
          `Encomenda ${enc.codigo}: ${pluralNome(item.quantidade, item.peca.nome)}` +
          (item.cor ? ` em ${item.cor.nome}` : ''),
        detalhe: `Cliente ${enc.cliente}.${prazo} Encomenda passa na frente da produção de estoque.`,
        quantidade: item.quantidade,
        prioridade: 0,
        pecaId: item.pecaId,
        pecaNome: item.peca.nome,
        corId: item.corId ?? undefined,
        corNome: item.cor?.nome,
        corHex: item.cor?.hex,
        encomendaId: enc.id,
        situacao: enc.status === 'em_producao' ? 'em_andamento' : 'nao_iniciada',
        situacaoDetalhe:
          enc.status === 'em_producao' ? 'Encomenda em produção.' : 'Encomenda ainda não começou.',
      })
      planoParaInsumos.push({
        pecaId: item.pecaId,
        corId: item.corId,
        quantidade: item.quantidade,
      })
    }
  }

  for (const peca of pecas as PecaCrua[]) {
    const atual = estoque.porPeca.get(peca.id) ?? { prontos: 0, biscoito: 0, emProducao: 0 }
    const emAndamento = temLoteAberto.has(peca.id)

    const perda = perdaDaPeca(
      movimentosDaPeca.get(peca.id) ?? [],
      Number(peca.custo?.perdaEstimadaPercentual ?? 10),
    )

    const roteiro: EtapaDoRoteiro[] = peca.roteiro.map((r) => ({
      etapaId: r.etapa.id,
      nome: r.etapa.nome,
      ordem: r.ordem,
      diasEstimados: r.diasEstimados,
      aguardaCarga: r.etapa.aguardaCarga,
      estoqueIntermediario: r.etapa.estoqueIntermediario,
    }))
    const previsaoDoZero = preverConclusao(roteiro, 0)
    const semanas = semanasParaRepor(previsaoDoZero)

    /** quantas COMEÇAR para `entregar` chegarem inteiras */
    const comPerda = (entregar: number) => {
      const comecar = quantidadeComPerda(entregar, perda.percentual)
      return {
        quantidade: comecar,
        ajustePerda:
          comecar > entregar
            ? {
                comecar,
                entregar,
                percentual: Math.round(perda.percentual * 10) / 10,
                origem: perda.origem,
              }
            : undefined,
      }
    }

    // ── 1. falta peça pronta? ────────────────────────────
    const cobertura = atual.prontos + atual.emProducao + atual.biscoito
    const faltamProntas = peca.qtdMinimaDesejada - cobertura
    const coberturaVenda = calcularCobertura(
      atual.prontos,
      vendasDaPeca.get(peca.id) ?? [],
      competencia,
      semanas,
      atual.emProducao,
    )

    if (peca.qtdMinimaDesejada > 0 && faltamProntas > 0) {
      const ajuste = comPerda(faltamProntas)
      sugestoes.push({
        tipo: 'produzir',
        titulo: `Produzir ${pluralNome(ajuste.quantidade, peca.nome)}`,
        detalhe:
          `Mínimo desejado ${peca.qtdMinimaDesejada}. Hoje: ${plural(atual.prontos, 'pronta')}, ` +
          `${atual.emProducao} em produção, ${atual.biscoito} em biscoito.` +
          (coberturaVenda.semanas !== null ? ` ${coberturaVenda.explicacao}` : ''),
        prioridade: atual.prontos === 0 || coberturaVenda.vaiFaltar ? 1 : 2,
        pecaId: peca.id,
        pecaNome: peca.nome,
        previsao: faixaDe(previsaoDoZero.diasMinimo, previsaoDoZero.diasMaximo),
        ...ajuste,
        ...situacaoDe(faltamProntas, peca.qtdMinimaDesejada, emAndamento),
      })
      planoParaInsumos.push({ pecaId: peca.id, corId: null, quantidade: ajuste.quantidade })
    } else if (peca.qtdMinimaDesejada === 0 && coberturaVenda.vaiFaltar) {
      // Sem mínimo cadastrado, mas a venda mostra que vai faltar. É aqui que o
      // sistema descobre sozinho o que o chute do mínimo não pegou.
      const alvo = Math.ceil(coberturaVenda.porSemana * (semanas + 2)) - atual.prontos
      if (alvo > 0) {
        const ajuste = comPerda(alvo)
        sugestoes.push({
          tipo: 'produzir',
          titulo: `Produzir ${pluralNome(ajuste.quantidade, peca.nome)}`,
          detalhe: `Sem mínimo cadastrado, mas a venda diz que vai faltar. ${coberturaVenda.explicacao}`,
          prioridade: 1,
          pecaId: peca.id,
          pecaNome: peca.nome,
          previsao: faixaDe(previsaoDoZero.diasMinimo, previsaoDoZero.diasMaximo),
          ...ajuste,
          ...situacaoDe(alvo, alvo + atual.prontos, emAndamento),
        })
        planoParaInsumos.push({ pecaId: peca.id, corId: null, quantidade: ajuste.quantidade })
      }
    }

    // ── 2. o pulmão de biscoito está baixo? ──────────────
    const faltaBiscoito = peca.qtdMinimaBiscoito - atual.biscoito
    const temEtapaBiscoito = peca.roteiro.some((r) => r.etapa.estoqueIntermediario)
    if (temEtapaBiscoito && peca.qtdMinimaBiscoito > 0 && faltaBiscoito > 0) {
      const ajuste = comPerda(faltaBiscoito)
      sugestoes.push({
        tipo: 'produzir',
        titulo: `Repor biscoito de ${peca.nome}: ${ajuste.quantidade}`,
        detalhe:
          `Mínimo em biscoito ${peca.qtdMinimaBiscoito}, hoje ${atual.biscoito}. ` +
          'Biscoito é o pulmão: ele atende qualquer cor que sair na frente.',
        prioridade: 3,
        pecaId: peca.id,
        pecaNome: peca.nome,
        ...ajuste,
        ...situacaoDe(faltaBiscoito, peca.qtdMinimaBiscoito, emAndamento),
      })
      planoParaInsumos.push({ pecaId: peca.id, corId: null, quantidade: ajuste.quantidade })
    }

    // ── 3. falta alguma cor? ─────────────────────────────
    //
    // AQUI ESTAVA O DEFEITO. `Math.min(faltam, atual.biscoito)` era avaliado
    // dentro do laço por cor e `atual.biscoito` nunca decrementava — o mesmo
    // biscoito era prometido para todas as cores. Agora ele é repartido.
    const pedidos: PedidoDeCorLocal[] = peca.cores
      .map((pc) => {
        const prontas = estoque.prontosPorCor.get(`${peca.id}:${pc.corId}`) ?? 0
        const aCaminho = estoque.emProducaoPorCor.get(`${peca.id}:${pc.corId}`) ?? 0
        return {
          corId: pc.corId,
          corNome: pc.cor.nome,
          corHex: pc.cor.hex,
          faltam: pc.qtdMinimaDesejada - prontas - aCaminho,
          prontas,
          aCaminho,
          minimoDaCor: pc.qtdMinimaDesejada,
          fotoStatus: pc.fotoStatus,
        }
      })
      .filter((p) => p.minimoDaCor > 0 && p.faltam > 0)

    const porCor = new Map(pedidos.map((p) => [p.corId, p]))
    for (const a of alocarBiscoito(pedidos, atual.biscoito)) {
      const info = porCor.get(a.corId)!
      const vendaDaCor = calcularCobertura(
        info.prontas,
        vendasDaPecaCor.get(`${peca.id}:${a.corId}`) ?? [],
        competencia,
        semanas,
        info.aCaminho,
      )

      if (a.alocado > 0) {
        sugestoes.push({
          tipo: 'esmaltar',
          titulo: `Esmaltar ${pluralNome(a.alocado, peca.nome)} em ${a.corNome}`,
          detalhe:
            `Mínimo na cor ${info.minimoDaCor}, hoje ${plural(info.prontas, 'pronta')} e ${info.aCaminho} a caminho. ` +
            `Reservadas ${a.alocado} das ${atual.biscoito} em biscoito.` +
            (a.semBiscoito > 0 ? ` Faltam ${a.semBiscoito} que o biscoito não cobre.` : '') +
            (vendaDaCor.semanas !== null ? ` ${vendaDaCor.explicacao}` : ''),
          quantidade: a.alocado,
          prioridade: info.prontas === 0 || vendaDaCor.vaiFaltar ? 1 : 2,
          pecaId: peca.id,
          pecaNome: peca.nome,
          corId: a.corId,
          corNome: a.corNome,
          corHex: info.corHex,
          ...situacaoDe(a.faltam, info.minimoDaCor, info.aCaminho > 0),
        })
        planoParaInsumos.push({ pecaId: peca.id, corId: a.corId, quantidade: a.alocado })
      }

      if (a.semBiscoito > 0) {
        const ajuste = comPerda(a.semBiscoito)
        sugestoes.push({
          tipo: 'produzir',
          titulo: `Produzir ${pluralNome(ajuste.quantidade, peca.nome)} para esmaltar em ${a.corNome}`,
          detalhe:
            a.alocado > 0
              ? `O biscoito livre cobriu ${a.alocado}; o resto precisa começar do torno.`
              : `Não há biscoito livre desta peça — a cor ${a.corNome} depende de começar do torno.`,
          prioridade: info.prontas === 0 ? 1 : 2,
          pecaId: peca.id,
          pecaNome: peca.nome,
          corId: a.corId,
          corNome: a.corNome,
          corHex: info.corHex,
          previsao: faixaDe(previsaoDoZero.diasMinimo, previsaoDoZero.diasMaximo),
          ...ajuste,
          ...situacaoDe(a.faltam, info.minimoDaCor, info.aCaminho > 0),
        })
        planoParaInsumos.push({ pecaId: peca.id, corId: a.corId, quantidade: ajuste.quantidade })
      }
    }

    // ── 3b. combinação peça+cor sem foto publicada ───────
    //
    // Peça pronta sem foto não é peça vendável. Só combinação NOVA precisa de
    // foto: um Bowl Pistache fotografado uma vez serve toda fornada futura.
    for (const pc of peca.cores) {
      if (pc.fotoStatus === 'publicado') continue
      const prontas = estoque.prontosPorCor.get(`${peca.id}:${pc.corId}`) ?? 0
      const aCaminho = estoque.emProducaoPorCor.get(`${peca.id}:${pc.corId}`) ?? 0
      if (prontas === 0 && aCaminho === 0) continue // nada existindo, nada a fotografar
      sugestoes.push({
        tipo: 'fotografar',
        titulo: `Fotografar ${peca.nome} em ${pc.cor.nome}`,
        detalhe:
          pc.fotoStatus === 'pendente'
            ? `Esta combinação nunca foi fotografada. Há ${prontas} pronta${prontas === 1 ? '' : 's'} que não podem ir para a loja sem foto.`
            : `Ciclo da foto parado em "${pc.fotoStatus}". Só vira peça vendável em "publicado".`,
        quantidade: Math.max(1, prontas),
        prioridade: prontas > 0 ? 1 : 3,
        pecaId: peca.id,
        pecaNome: peca.nome,
        corId: pc.corId,
        corNome: pc.cor.nome,
        corHex: pc.cor.hex,
        situacao: pc.fotoStatus === 'pendente' ? 'nao_iniciada' : 'em_andamento',
        situacaoDetalhe: `Foto em "${pc.fotoStatus}".`,
      })
    }
  }

  // ── 4. o forno: "faltam N para fechar a carga" ───────────
  for (const fila of filaQueimas) {
    if (fila.recomendacao.acao === 'esperar') continue
    const rotulo = fila.tipo === 'biscoito' ? '1ª queima' : '2ª queima'
    if (fila.recomendacao.acao === 'queimar') {
      sugestoes.push({
        tipo: 'queimar',
        titulo: `Queimar: ${fila.situacao.esperando} peças esperando a ${rotulo}`,
        detalhe: fila.recomendacao.motivo,
        quantidade: fila.situacao.cabeAgora,
        prioridade: 1,
        queimaTipo: fila.tipo,
        situacao: 'nao_iniciada',
        situacaoDetalhe: `Forno a ${fila.situacao.ocupacao}% de ocupação.`,
      })
    } else {
      sugestoes.push({
        tipo: 'queimar',
        titulo: `Faltam ${fila.recomendacao.faltam} para fechar a carga da ${rotulo}`,
        detalhe: fila.recomendacao.motivo,
        quantidade: fila.recomendacao.faltam,
        prioridade: 2,
        queimaTipo: fila.tipo,
        situacao: 'em_andamento',
        situacaoDetalhe: `${fila.situacao.esperando} de ${fila.situacao.capacidade} lugares ocupados.`,
      })
    }
  }

  // ── 5. insumo: previsão do plano, não reação ao mínimo ──
  const consumosPorPeca = new Map<string, ConsumoDeInsumo[]>()
  for (const i of insumosCadastrados) {
    const lista = consumosPorPeca.get(i.pecaId) ?? []
    lista.push({
      materiaPrimaId: i.materiaPrimaId,
      quantidadePorPeca: Number(i.quantidadePorPeca),
      corId: i.corId,
    })
    consumosPorPeca.set(i.pecaId, lista)
  }
  const estoquesDeInsumo = new Map<string, EstoqueDeInsumo>(
    (materias as MateriaCrua[]).map((m) => [
      m.id,
      {
        materiaPrimaId: m.id,
        nome: m.nome,
        unidade: m.unidade,
        estoqueAtual: Number(m.estoqueAtual),
        estoqueMinimo: Number(m.estoqueMinimo),
        prazoEntregaDias: m.prazoEntregaDias,
      },
    ]),
  )

  const jaSugeridos = new Set<string>()
  for (const n of necessidadeDeInsumos(planoParaInsumos, consumosPorPeca, estoquesDeInsumo)) {
    if (n.comprar <= 0) continue
    jaSugeridos.add(n.materiaPrimaId)
    sugestoes.push({
      tipo: 'comprar',
      titulo: `Comprar ${n.comprar} ${n.unidade} de ${n.nome}`,
      detalhe:
        `O plano de agora consome ${n.necessario} ${n.unidade} e há ${n.estoqueAtual} ${n.unidade}.` +
        (n.urgente
          ? ` O fornecedor leva ${n.prazoEntregaDias} dias — pedir hoje já é em cima da hora.`
          : ''),
      quantidade: Math.ceil(n.comprar),
      prioridade: n.urgente ? 1 : 2,
      materiaPrimaId: n.materiaPrimaId,
      situacao: 'nao_iniciada',
      situacaoDetalhe: 'Compra ainda não registrada.',
    })
  }

  // insumo abaixo do mínimo que o plano não pediu continua valendo aviso
  for (const m of materias as MateriaCrua[]) {
    if (jaSugeridos.has(m.id)) continue
    const atual = Number(m.estoqueAtual)
    const minimo = Number(m.estoqueMinimo)
    if (minimo <= 0 || atual >= minimo) continue
    sugestoes.push({
      tipo: 'comprar',
      titulo: `Comprar ${m.nome}`,
      detalhe: `Estoque em ${atual} ${m.unidade}, abaixo do mínimo de ${minimo} ${m.unidade}.`,
      quantidade: Math.ceil(minimo - atual),
      prioridade: atual <= 0 ? 1 : 3,
      materiaPrimaId: m.id,
      situacao: 'nao_iniciada',
      situacaoDetalhe: 'Compra ainda não registrada.',
    })
  }

  sugestoes.sort((a, b) => a.prioridade - b.prioridade || b.quantidade - a.quantidade)

  const resumo = {
    total: sugestoes.length,
    produzir: sugestoes.filter((s) => s.tipo === 'produzir').length,
    esmaltar: sugestoes.filter((s) => s.tipo === 'esmaltar').length,
    comprar: sugestoes.filter((s) => s.tipo === 'comprar').length,
    queimar: sugestoes.filter((s) => s.tipo === 'queimar').length,
    fotografar: sugestoes.filter((s) => s.tipo === 'fotografar').length,
    encomenda: sugestoes.filter((s) => s.tipo === 'encomenda').length,
    urgentes: sugestoes.filter((s) => s.prioridade <= 1).length,
  }

  return { sugestoes, resumo }
}

/**
 * Saber se a demanda foi concluída, está pela metade ou nem começou — sem
 * ninguém marcar caixinha. A situação é DERIVADA dos lotes que existem.
 */
function situacaoDe(faltam: number, meta: number, temLoteAberto: boolean) {
  if (faltam <= 0) {
    return { situacao: 'concluida', situacaoDetalhe: 'Meta atingida.' }
  }
  if (!temLoteAberto) {
    return { situacao: 'nao_iniciada', situacaoDetalhe: 'Nenhum lote aberto para esta peça.' }
  }
  const feito = meta - faltam
  if (feito > 0) {
    const pct = Math.round((feito / meta) * 100)
    return { situacao: 'parcial', situacaoDetalhe: `${pct}% da meta coberto; há lote em andamento.` }
  }
  return { situacao: 'em_andamento', situacaoDetalhe: 'Lote aberto, ainda sem nada coberto.' }
}
