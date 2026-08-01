#!/usr/bin/env node
/*
 * Confere se todo `prisma.<modelo>` e todo nome de campo usado nos serviços
 * existe de verdade no schema.
 *
 * POR QUE ISTO EXISTE. Normalmente quem faz esse trabalho é o TypeScript: o
 * Prisma Client gerado tipa cada modelo e um campo escrito errado não compila.
 * Onde o Client não pode ser gerado (ambiente sem acesso a binaries.prisma.sh),
 * `prisma.qualquerCoisa` vira `any` e o compilador aceita `fotoStauts` sem
 * reclamar — o erro só aparece em produção, como registro que não salva.
 *
 * Este script devolve parte dessa rede: lê o DMMF pelo parser WASM do Prisma e
 * compara com o que os arquivos realmente escrevem.
 *
 * NÃO substitui o Client gerado. Não verifica tipos, só nomes. É deliberadamente
 * conservador: na dúvida, cala — melhor deixar passar do que gritar falso e
 * treinar todo mundo a ignorar o aviso.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const require_ = createRequire(import.meta.url)
function carregar(nome) {
  for (const base of [join(raiz, 'backend'), raiz]) {
    try {
      return require_(require_.resolve(nome, { paths: [base] }))
    } catch {
      /* tenta o próximo */
    }
  }
  throw new Error(`não achei o pacote ${nome}`)
}
const { getDMMF } = carregar('@prisma/internals')

const dmmf = await getDMMF({
  datamodel: readFileSync(join(raiz, 'backend/prisma/schema.prisma'), 'utf8'),
})

/** modelo em camelCase (como o client expõe) → conjunto de campos válidos */
const camposPorModelo = new Map()
const nomesDeModelo = new Map()
for (const m of dmmf.datamodel.models) {
  const acessor = m.name[0].toLowerCase() + m.name.slice(1)
  nomesDeModelo.set(acessor, m.name)
  camposPorModelo.set(acessor, new Set(m.fields.map((f) => f.name)))
}

/** operações do client que recebem objeto com campos do modelo */
const OPERACOES = new Set([
  'findMany',
  'findUnique',
  'findFirst',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'groupBy',
  'aggregate',
])

/**
 * Nomes que aparecem como chave mas NÃO são campo do modelo: são operadores do
 * Prisma, blocos de consulta, ou chaves compostas geradas (`pecaId_corId`).
 */
const PALAVRAS_DO_PRISMA = new Set([
  'where', 'data', 'select', 'include', 'orderBy', 'take', 'skip', 'cursor',
  'distinct', 'by', 'having', 'create', 'update', 'upsert', 'connect', 'set',
  'disconnect', 'delete', 'deleteMany', 'createMany', 'updateMany', 'connectOrCreate',
  'increment', 'decrement', 'multiply', 'divide', 'push',
  'equals', 'not', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte', 'contains',
  'startsWith', 'endsWith', 'mode', 'search', 'some', 'every', 'none', 'is', 'isNot',
  'AND', 'OR', 'NOT', 'count', 'avg', 'sum', 'min', 'max', '_count', '_sum',
  '_avg', '_min', '_max', '_all', 'asc', 'desc',
])

/**
 * Tira comentários e literais de texto, trocando por espaços do mesmo tamanho
 * para as posições (e portanto os números de linha) continuarem certas.
 *
 * Sem isto o verificador acusava `Lote cancelado: ${motivo}` como campo, e um
 * verificador que grita errado treina todo mundo a ignorá-lo.
 */
function limparTextoENotas(texto) {
  const saida = texto.split('')
  let i = 0
  const apagarAte = (fim) => {
    for (let k = i; k < fim && k < saida.length; k++) if (saida[k] !== '\n') saida[k] = ' '
    i = fim
  }
  while (i < texto.length) {
    const c = texto[i]
    const prox = texto[i + 1]
    if (c === '/' && prox === '/') {
      const fim = texto.indexOf('\n', i)
      apagarAte(fim === -1 ? texto.length : fim)
    } else if (c === '/' && prox === '*') {
      const fim = texto.indexOf('*/', i + 2)
      apagarAte(fim === -1 ? texto.length : fim + 2)
    } else if (c === '"' || c === "'" || c === '`') {
      let k = i + 1
      while (k < texto.length) {
        if (texto[k] === '\\') k += 2
        else if (texto[k] === c) break
        else k++
      }
      apagarAte(Math.min(k + 1, texto.length))
    } else i++
  }
  return saida.join('')
}

const arquivos = []
const varrer = (dir) => {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      if (nome === 'migrations' || nome === 'node_modules') continue
      varrer(caminho)
    } else if (nome.endsWith('.ts')) arquivos.push(caminho)
  }
}
varrer(join(raiz, 'backend/src'))
/*
 * prisma/ entra junto. O seed e o limpar-producao falam com o banco tanto
 * quanto qualquer service, e não passam pelo tsc com tipos de verdade — foi
 * exatamente aí que `contador.chave` (o campo se chama `nome`) passou batido.
 */
varrer(join(raiz, 'backend/prisma'))

const problemas = []
let modelosVistos = 0
let camposConferidos = 0

for (const arquivo of arquivos) {
  const texto = limparTextoENotas(readFileSync(arquivo, 'utf8'))
  const curto = relative(raiz, arquivo)

  // 1) o modelo existe?  prisma.foo.findMany / tx.foo.create
  for (const m of texto.matchAll(/\b(?:prisma|tx|cliente)\.([a-zA-Z][a-zA-Z0-9]*)\.([a-zA-Z]+)\(/g)) {
    const [, modelo, operacao] = m
    if (modelo.startsWith('$')) continue
    if (!OPERACOES.has(operacao)) continue
    modelosVistos++
    if (!camposPorModelo.has(modelo)) {
      const linha = texto.slice(0, m.index).split('\n').length
      problemas.push(`${curto}:${linha} — modelo inexistente: prisma.${modelo}`)
    }
  }

  // 2) os campos escritos dentro de cada chamada existem?
  //    varredura por blocos balanceados a partir de `prisma.<modelo>.<op>(`
  for (const m of texto.matchAll(/\b(?:prisma|tx|cliente)\.([a-zA-Z][a-zA-Z0-9]*)\.([a-zA-Z]+)\(/g)) {
    const [, modelo, operacao] = m
    if (!OPERACOES.has(operacao) || !camposPorModelo.has(modelo)) continue

    const inicio = m.index + m[0].length - 1
    let nivel = 0
    let fim = inicio
    for (let i = inicio; i < texto.length; i++) {
      if (texto[i] === '(') nivel++
      else if (texto[i] === ')') {
        nivel--
        if (nivel === 0) {
          fim = i
          break
        }
      }
    }
    const bloco = texto.slice(inicio, fim)
    const validos = camposPorModelo.get(modelo)

    // relações trazidas por include/select têm campos de OUTRO modelo — para não
    // dar falso positivo, junta os campos de todos os modelos relacionados
    const permitidos = new Set(validos)
    const modelo_ = dmmf.datamodel.models.find((x) => x.name === nomesDeModelo.get(modelo))
    const fila = [...(modelo_?.fields ?? [])]
    const vistos = new Set([modelo_?.name])
    while (fila.length) {
      const campo = fila.shift()
      if (campo.kind !== 'object' || vistos.has(campo.type)) continue
      vistos.add(campo.type)
      const alvo = dmmf.datamodel.models.find((x) => x.name === campo.type)
      if (!alvo) continue
      for (const f of alvo.fields) {
        permitidos.add(f.name)
        if (f.kind === 'object') fila.push(f)
      }
    }

    // chave de objeto de verdade vem depois de `{` ou `,`; assim o `: b` de um
    // ternário `cond ? a : b` não é confundido com campo
    for (const chave of bloco.matchAll(/[{,]\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)) {
      const nome = chave[1]
      if (PALAVRAS_DO_PRISMA.has(nome)) continue
      // chave composta gerada pelo Prisma: pecaId_corId, responsavelId_data…
      if (nome.includes('_') && nome.split('_').every((p) => permitidos.has(p))) continue
      camposConferidos++
      if (!permitidos.has(nome)) {
        const linha = texto.slice(0, inicio + chave.index).split('\n').length
        problemas.push(`${curto}:${linha} — campo desconhecido em prisma.${modelo}: "${nome}"`)
      }
    }
  }
}

console.log(
  `conferidos ${modelosVistos} usos de modelo e ${camposConferidos} nomes de campo ` +
    `em ${arquivos.length} arquivos`,
)
if (problemas.length === 0) {
  console.log('nenhum nome de modelo ou campo fora do schema')
  process.exit(0)
}
console.error(`\n${problemas.length} problema(s):`)
for (const p of problemas) console.error(`  - ${p}`)
process.exit(1)
