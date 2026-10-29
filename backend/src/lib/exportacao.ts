/*
 * EXPORTAÇÃO DO HISTÓRICO EM PLANILHA (US-42).
 *
 * O dado entrava por planilha e não saía por lugar nenhum. CSV com ponto e
 * vírgula, porque é o separador que o Excel em pt-BR abre direto, e com BOM
 * UTF-8, senão "Xícara" vira "XÃ­cara" na primeira abertura.
 */
export type LinhaExportada = Record<string, string | number | null | undefined>

export function celulaCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  const texto = typeof valor === 'number' ? String(valor).replace('.', ',') : valor
  // fórmula injetada (=, +, -, @) vira texto: planilha aberta não pode executar o que alguém digitou
  const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto
  return /[;"\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

export function paraCsv(colunas: { chave: string; rotulo: string }[], linhas: LinhaExportada[]): string {
  const cabecalho = colunas.map((c) => celulaCsv(c.rotulo)).join(';')
  const corpo = linhas.map((l) => colunas.map((c) => celulaCsv(l[c.chave])).join(';'))
  return '﻿' + [cabecalho, ...corpo].join('\r\n') + '\r\n'
}

/** "2026-10-29T13:05:00Z" no fuso do ateliê (UTC-3), do jeito que a pessoa lê */
export function instanteBr(data: Date): string {
  const local = new Date(data.getTime() - 3 * 60 * 60 * 1000)
  const [d, h] = local.toISOString().slice(0, 16).split('T')
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a} ${h}`
}
