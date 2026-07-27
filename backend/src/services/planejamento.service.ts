import { prisma } from '../lib/prisma'
import { calcularEstoque } from './estoque.service'

/*
 * O módulo que a Gabi chamou de mais importante. Ele responde "o que produzir"
 * cruzando três coisas: o mínimo desejado, o que já existe, e o que já está a
 * caminho. Sem descontar o que está a caminho, o sistema mandaria produzir de
 * novo tudo que ainda está secando — e o ateliê afogaria.
 *
 * A saída sai no formato que ela escreveu:
 *   Produzir 50 Xícaras Andorinha
 *   Esmaltar 20 peças Pistache
 *   Comprar mais esmalte
 */

export type Sugestao = {
  tipo: 'produzir' | 'esmaltar' | 'comprar'
  titulo: string
  detalhe: string
  quantidade: number
  prioridade: number
  pecaId?: string
  pecaNome?: string
  corId?: string
  corNome?: string
  corHex?: string
  materiaPrimaId?: string
  /** nao_iniciada | em_andamento | parcial | concluida */
  situacao: string
  situacaoDetalhe: string
}

const plural = (n: number, singular: string) => `${n} ${singular}${n === 1 ? '' : 's'}`

export async function sugerir(): Promise<{ sugestoes: Sugestao[]; resumo: Record<string, number> }> {
  const [pecas, materias, estoque] = await Promise.all([
    prisma.peca.findMany({
      where: { ativo: true },
      include: {
        cores: { where: { ativo: true }, include: { cor: true } },
        roteiro: { include: { etapa: { select: { defineCor: true, estoqueIntermediario: true } } } },
      },
    }),
    prisma.materiaPrima.findMany({ where: { ativo: true } }),
    calcularEstoque(),
  ])

  // lotes em aberto por peça: é o que diz se a demanda já começou
  const lotesAbertos = await prisma.lote.groupBy({
    by: ['pecaId'],
    where: { canceladoEm: null, concluidoEm: null },
    _count: { _all: true },
  })
  const temLoteAberto = new Set(lotesAbertos.map((l: { pecaId: string }) => l.pecaId))

  const sugestoes: Sugestao[] = []

  for (const peca of pecas as {
    id: string
    nome: string
    qtdMinimaDesejada: number
    qtdMinimaBiscoito: number
    cores: { corId: string; qtdMinimaDesejada: number; cor: { id: string; nome: string; hex: string } }[]
    roteiro: { etapa: { defineCor: boolean; estoqueIntermediario: boolean } }[]
  }[]) {
    const atual = estoque.porPeca.get(peca.id) ?? { prontos: 0, biscoito: 0, emProducao: 0 }
    const emAndamento = temLoteAberto.has(peca.id)

    // ── 1. falta peça pronta? ────────────────────────────
    // conta biscoito também: ele vira peça pronta sem começar do zero
    const cobertura = atual.prontos + atual.emProducao + atual.biscoito
    const faltamProntas = peca.qtdMinimaDesejada - cobertura
    if (peca.qtdMinimaDesejada > 0 && faltamProntas > 0) {
      sugestoes.push({
        tipo: 'produzir',
        titulo: `Produzir ${plural(faltamProntas, peca.nome)}`,
        detalhe:
          `Mínimo desejado ${peca.qtdMinimaDesejada}. Hoje: ${atual.prontos} pronta(s), ` +
          `${atual.emProducao} em produção, ${atual.biscoito} em biscoito.`,
        quantidade: faltamProntas,
        prioridade: atual.prontos === 0 ? 1 : 2,
        pecaId: peca.id,
        pecaNome: peca.nome,
        ...situacaoDe(faltamProntas, peca.qtdMinimaDesejada, emAndamento),
      })
    }

    // ── 2. o pulmão de biscoito está baixo? ──────────────
    const faltaBiscoito = peca.qtdMinimaBiscoito - atual.biscoito
    const temEtapaBiscoito = peca.roteiro.some((r) => r.etapa.estoqueIntermediario)
    if (temEtapaBiscoito && peca.qtdMinimaBiscoito > 0 && faltaBiscoito > 0) {
      sugestoes.push({
        tipo: 'produzir',
        titulo: `Repor biscoito de ${peca.nome}: ${faltaBiscoito}`,
        detalhe:
          `Mínimo em biscoito ${peca.qtdMinimaBiscoito}, hoje ${atual.biscoito}. ` +
          'Biscoito é o pulmão: ele atende qualquer cor que sair na frente.',
        quantidade: faltaBiscoito,
        prioridade: 3,
        pecaId: peca.id,
        pecaNome: peca.nome,
        ...situacaoDe(faltaBiscoito, peca.qtdMinimaBiscoito, emAndamento),
      })
    }

    // ── 3. falta alguma cor específica? ──────────────────
    for (const pc of peca.cores) {
      if (pc.qtdMinimaDesejada <= 0) continue
      const prontasNaCor = estoque.prontosPorCor.get(`${peca.id}:${pc.corId}`) ?? 0
      const aCaminhoNaCor = estoque.emProducaoPorCor.get(`${peca.id}:${pc.corId}`) ?? 0
      const faltam = pc.qtdMinimaDesejada - prontasNaCor - aCaminhoNaCor
      if (faltam <= 0) continue

      // só dá pra esmaltar o que existe em biscoito neutro
      const possivel = Math.min(faltam, atual.biscoito)
      if (possivel > 0) {
        sugestoes.push({
          tipo: 'esmaltar',
          titulo: `Esmaltar ${possivel} ${peca.nome} em ${pc.cor.nome}`,
          detalhe:
            `Mínimo na cor ${pc.qtdMinimaDesejada}, hoje ${prontasNaCor} pronta(s) e ${aCaminhoNaCor} a caminho. ` +
            `Há ${atual.biscoito} em biscoito para usar.`,
          quantidade: possivel,
          prioridade: prontasNaCor === 0 ? 1 : 2,
          pecaId: peca.id,
          pecaNome: peca.nome,
          corId: pc.cor.id,
          corNome: pc.cor.nome,
          corHex: pc.cor.hex,
          ...situacaoDe(faltam, pc.qtdMinimaDesejada, aCaminhoNaCor > 0),
        })
      } else {
        sugestoes.push({
          tipo: 'produzir',
          titulo: `Produzir ${faltam} ${peca.nome} para esmaltar em ${pc.cor.nome}`,
          detalhe: `Não há biscoito disponível desta peça — a cor ${pc.cor.nome} depende de começar do torno.`,
          quantidade: faltam,
          prioridade: 2,
          pecaId: peca.id,
          pecaNome: peca.nome,
          corId: pc.cor.id,
          corNome: pc.cor.nome,
          corHex: pc.cor.hex,
          ...situacaoDe(faltam, pc.qtdMinimaDesejada, emAndamento),
        })
      }
    }
  }

  // ── 4. matéria-prima abaixo do mínimo ──────────────────
  for (const m of materias as {
    id: string
    nome: string
    unidade: string
    estoqueAtual: unknown
    estoqueMinimo: unknown
  }[]) {
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
    urgentes: sugestoes.filter((s) => s.prioridade === 1).length,
  }

  return { sugestoes, resumo }
}

/**
 * O método de validação que o Maicon pediu: saber se a demanda foi concluída,
 * está pela metade ou nem começou — sem ninguém marcar caixinha.
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
