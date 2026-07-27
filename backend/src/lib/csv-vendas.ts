/**
 * Importação da planilha de vendas.
 *
 * Mercado Livre e Shopee exportam relatório mensal em CSV. Exigir integração
 * por API seria o certo em outro momento; agora seria semanas de trabalho para
 * um dado que a Vera consegue baixar em dois cliques. E digitar venda a venda
 * ninguém faz — a planilha é o caminho que sobrevive ao dia a dia.
 *
 * Puro de propósito: recebe texto, devolve linhas e erros. Quem resolve nome de
 * peça para id é o serviço.
 */

export type LinhaVenda = {
  linha: number
  peca: string
  cor: string | null
  competencia: string
  quantidade: number
  valorTotal: number | null
}

export type ErroDeLinha = { linha: number; motivo: string; conteudo: string }

export type ResultadoCsv = {
  linhas: LinhaVenda[]
  erros: ErroDeLinha[]
  /** cabeçalho reconhecido, para a tela conseguir explicar o que foi lido */
  colunas: string[]
}

/** Tira acento e caixa — cabeçalho vem "Peça", "peca", "PEÇA" e tudo dá certo. */
const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/**
 * Separador: vírgula ou ponto e vírgula.
 *
 * Excel em português salva CSV com PONTO E VÍRGULA, porque a vírgula já é o
 * separador decimal. Detectar isso evita o suporte mais chato que existe —
 * "importei e veio tudo numa coluna só".
 */
function detectarSeparador(cabecalho: string): ';' | ',' | '\t' {
  const ponto = (cabecalho.match(/;/g) ?? []).length
  const virgula = (cabecalho.match(/,/g) ?? []).length
  const tab = (cabecalho.match(/\t/g) ?? []).length
  if (tab > ponto && tab > virgula) return '\t'
  return ponto >= virgula ? ';' : ','
}

/** Divide respeitando aspas — nome de peça com vírgula dentro não quebra a linha. */
function dividir(linha: string, sep: string): string[] {
  const campos: string[] = []
  let atual = ''
  let dentroDeAspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"'
        i++
      } else dentroDeAspas = !dentroDeAspas
    } else if (c === sep && !dentroDeAspas) {
      campos.push(atual)
      atual = ''
    } else atual += c
  }
  campos.push(atual)
  return campos.map((c) => c.trim())
}

/**
 * Número em português: `1.234,56` é mil duzentos e trinta e quatro.
 * Ler isso como `1.234` (o que `Number()` faz) erraria por mil vezes.
 */
export function numeroBr(texto: string): number | null {
  const limpo = texto.replace(/[R$\s]/gi, '').trim()
  if (!limpo) return null
  const temVirgula = limpo.includes(',')
  const normal = temVirgula ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

/** `07/2026`, `2026-07`, `jul/2026` → `2026-07`. */
export function competenciaBr(texto: string, anoPadrao?: number): string | null {
  const t = texto.trim()
  let m = /^(\d{4})-(\d{1,2})$/.exec(t)
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`
  m = /^(\d{1,2})\/(\d{4})$/.exec(t)
  if (m) return `${m[2]}-${String(Number(m[1])).padStart(2, '0')}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t) // data completa: pega mês e ano
  if (m) return `${m[3]}-${String(Number(m[2])).padStart(2, '0')}`
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  m = /^([a-zç]{3})[a-zç]*[\/\-\s]?(\d{4})?$/i.exec(normalizar(t))
  if (m) {
    const i = meses.indexOf(m[1])
    const ano = m[2] ? Number(m[2]) : anoPadrao
    if (i >= 0 && ano) return `${ano}-${String(i + 1).padStart(2, '0')}`
  }
  return null
}

const ALIAS: Record<string, string[]> = {
  peca: ['peca', 'produto', 'item', 'titulo', 'titulo do anuncio', 'descricao', 'anuncio'],
  cor: ['cor', 'esmalte', 'variacao', 'cor/variacao'],
  competencia: ['competencia', 'mes', 'mes/ano', 'periodo', 'data', 'data da venda'],
  quantidade: ['quantidade', 'qtd', 'qtde', 'unidades', 'vendidos', 'quantidade vendida'],
  valorTotal: ['valor total', 'valor', 'total', 'receita', 'faturamento', 'valor bruto'],
}

function acharColuna(cabecalho: string[], chave: keyof typeof ALIAS): number {
  const alvos = ALIAS[chave]
  return cabecalho.findIndex((c) => alvos.includes(normalizar(c)))
}

/**
 * Lê o CSV. Nunca lança: linha ruim vira erro descrito, e o resto importa.
 * Planilha de marketplace sempre tem uma linha estranha; abortar tudo por causa
 * dela seria o comportamento errado.
 */
export function lerCsvDeVendas(conteudo: string, anoPadrao?: number): ResultadoCsv {
  const texto = conteudo.replace(/^﻿/, '') // BOM que o Excel adora
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (linhas.length === 0) return { linhas: [], erros: [], colunas: [] }

  const sep = detectarSeparador(linhas[0])
  const cabecalho = dividir(linhas[0], sep)

  const iPeca = acharColuna(cabecalho, 'peca')
  const iCor = acharColuna(cabecalho, 'cor')
  const iComp = acharColuna(cabecalho, 'competencia')
  const iQtd = acharColuna(cabecalho, 'quantidade')
  const iValor = acharColuna(cabecalho, 'valorTotal')

  const erros: ErroDeLinha[] = []
  if (iPeca < 0 || iQtd < 0) {
    erros.push({
      linha: 1,
      motivo:
        'A planilha precisa de pelo menos uma coluna de peça (peça, produto, item…) e uma de quantidade (quantidade, qtd, unidades…).',
      conteudo: linhas[0],
    })
    return { linhas: [], erros, colunas: cabecalho }
  }

  const resultado: LinhaVenda[] = []
  for (let n = 1; n < linhas.length; n++) {
    const campos = dividir(linhas[n], sep)
    const peca = (campos[iPeca] ?? '').trim()
    if (!peca) {
      erros.push({ linha: n + 1, motivo: 'sem nome de peça', conteudo: linhas[n] })
      continue
    }
    const quantidade = numeroBr(campos[iQtd] ?? '')
    if (quantidade === null || quantidade <= 0) {
      erros.push({ linha: n + 1, motivo: 'quantidade inválida', conteudo: linhas[n] })
      continue
    }
    const competencia = iComp >= 0 ? competenciaBr(campos[iComp] ?? '', anoPadrao) : null
    if (!competencia) {
      erros.push({
        linha: n + 1,
        motivo: iComp >= 0 ? 'mês não reconhecido' : 'a planilha não tem coluna de mês',
        conteudo: linhas[n],
      })
      continue
    }
    const cor = iCor >= 0 ? (campos[iCor] ?? '').trim() || null : null
    resultado.push({
      linha: n + 1,
      peca,
      cor,
      competencia,
      quantidade: Math.round(quantidade),
      valorTotal: iValor >= 0 ? numeroBr(campos[iValor] ?? '') : null,
    })
  }

  return { linhas: resultado, erros, colunas: cabecalho }
}

/**
 * Soma linhas que caem na mesma chave (peça+cor+mês).
 *
 * A planilha do marketplace traz uma linha por PEDIDO; o sistema guarda uma por
 * mês. Sem somar aqui, a última linha sobrescreveria as anteriores e a venda do
 * mês inteiro viraria a de um pedido só.
 */
export function agruparVendas(linhas: LinhaVenda[]): LinhaVenda[] {
  const mapa = new Map<string, LinhaVenda>()
  for (const l of linhas) {
    const chave = `${normalizar(l.peca)}|${normalizar(l.cor ?? '')}|${l.competencia}`
    const existente = mapa.get(chave)
    if (existente) {
      existente.quantidade += l.quantidade
      if (l.valorTotal !== null) existente.valorTotal = (existente.valorTotal ?? 0) + l.valorTotal
    } else {
      mapa.set(chave, { ...l })
    }
  }
  return [...mapa.values()]
}
