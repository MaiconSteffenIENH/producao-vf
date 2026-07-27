#!/usr/bin/env node
/*
 * Confere o schema.prisma contra um PostgreSQL de verdade, tabela por tabela e
 * coluna por coluna.
 *
 * POR QUE ISTO EXISTE. `prisma migrate dev` gera a migração e garante que ela
 * bate com o schema. Onde não dá para rodar o Prisma (ambiente sem acesso a
 * binaries.prisma.sh, que devolve 403), a migração é escrita à mão — e aí some
 * a garantia. Este script devolve a garantia por outro caminho: lê o DMMF pelo
 * parser WASM do Prisma (que não precisa de binário nativo), aplica as
 * migrações num banco limpo e compara os dois lados.
 *
 * Pega o que o olho não pega: coluna esquecida na migração, @map divergente,
 * tipo trocado, nulabilidade errada, índice único que não foi criado.
 *
 * Uso:
 *   node scripts/conferir-schema.mjs "postgresql://user@localhost/banco"
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const urlBanco = process.argv[2]
if (!urlBanco) {
  console.error('uso: node scripts/conferir-schema.mjs <url-do-postgres>')
  process.exit(2)
}

// getDMMF e pg podem estar em qualquer node_modules alcançável — o script roda
// tanto da raiz quanto do backend
const require_ = createRequire(import.meta.url)
function carregar(nome, extras = []) {
  for (const base of [join(raiz, 'backend'), raiz, ...extras]) {
    try {
      return require_(require_.resolve(nome, { paths: [base] }))
    } catch {
      /* tenta o próximo */
    }
  }
  throw new Error(`não achei o pacote ${nome}`)
}

const { getDMMF } = carregar('@prisma/internals')
const { Client } = carregar('pg')

/** Tipo do Postgres esperado para cada tipo do Prisma. */
function tipoEsperado(campo) {
  const nativo = campo.nativeType?.[0]
  if (nativo === 'Uuid') return ['uuid']
  if (nativo === 'Date') return ['date']
  if (nativo === 'Decimal') return ['numeric']
  if (nativo === 'Timestamp') return ['timestamp without time zone']
  switch (campo.type) {
    case 'String':
      return ['text', 'character varying']
    case 'Int':
      return ['integer']
    case 'BigInt':
      return ['bigint']
    case 'Boolean':
      return ['boolean']
    case 'DateTime':
      return ['timestamp without time zone', 'timestamp with time zone', 'date']
    case 'Decimal':
      return ['numeric']
    case 'Json':
      return ['jsonb', 'json']
    case 'Float':
      return ['double precision']
    default:
      return null // enum ou tipo que não sabemos conferir
  }
}

const problemas = []
const anota = (msg) => problemas.push(msg)

const dmmf = await getDMMF({
  datamodel: readFileSync(join(raiz, 'backend/prisma/schema.prisma'), 'utf8'),
})

const cliente = new Client({ connectionString: urlBanco })
await cliente.connect()

// aplica todas as migrações, em ordem, num banco limpo
await cliente.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
const pastaMigracoes = join(raiz, 'backend/prisma/migrations')
const migracoes = readdirSync(pastaMigracoes)
  .filter((d) => !d.startsWith('.') && d !== 'migration_lock.toml')
  .sort()
if (migracoes.length === 0) {
  console.error('ERRO: nenhuma migração em backend/prisma/migrations')
  process.exit(1)
}
for (const m of migracoes) {
  const sql = readFileSync(join(pastaMigracoes, m, 'migration.sql'), 'utf8')
  try {
    await cliente.query(sql)
    console.log(`  aplicada  ${m}`)
  } catch (e) {
    console.error(`\nFALHA ao aplicar ${m}:\n  ${e.message}`)
    process.exit(1)
  }
}

const { rows: colunas } = await cliente.query(`
  select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns where table_schema = 'public'
`)
const { rows: indices } = await cliente.query(`
  select i.relname as nome, t.relname as tabela, ix.indisunique as unico
  from pg_index ix
  join pg_class i on i.oid = ix.indexrelid
  join pg_class t on t.oid = ix.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
`)
await cliente.end()

const porTabela = new Map()
for (const c of colunas) {
  if (!porTabela.has(c.table_name)) porTabela.set(c.table_name, new Map())
  porTabela.get(c.table_name).set(c.column_name, c)
}
const unicosPorTabela = new Map()
for (const i of indices) {
  if (!i.unico) continue
  if (!unicosPorTabela.has(i.tabela)) unicosPorTabela.set(i.tabela, new Set())
  unicosPorTabela.get(i.tabela).add(i.nome)
}

const tabelasDoSchema = new Set()

for (const modelo of dmmf.datamodel.models) {
  const tabela = modelo.dbName ?? modelo.name
  tabelasDoSchema.add(tabela)
  const doBanco = porTabela.get(tabela)
  if (!doBanco) {
    anota(`tabela AUSENTE no banco: "${tabela}" (modelo ${modelo.name})`)
    continue
  }

  for (const campo of modelo.fields) {
    if (campo.kind === 'object') continue // relação: não vira coluna
    const coluna = campo.dbName ?? campo.name
    const noBanco = doBanco.get(coluna)
    if (!noBanco) {
      anota(`coluna AUSENTE: ${tabela}.${coluna} (campo ${modelo.name}.${campo.name})`)
      continue
    }
    const esperados = tipoEsperado(campo)
    if (esperados && !esperados.includes(noBanco.data_type)) {
      anota(
        `tipo DIVERGENTE: ${tabela}.${coluna} — banco tem "${noBanco.data_type}", ` +
          `schema pede ${campo.type}${campo.nativeType ? `/${campo.nativeType[0]}` : ''} (${esperados.join(' ou ')})`,
      )
    }
    // obrigatório sem default no schema tem de ser NOT NULL no banco
    const temDefault = campo.hasDefaultValue || noBanco.column_default !== null
    const nulavelNoBanco = noBanco.is_nullable === 'YES'
    if (campo.isRequired && nulavelNoBanco && !temDefault) {
      anota(`nulabilidade: ${tabela}.${coluna} é obrigatório no schema e aceita NULL no banco`)
    }
    if (!campo.isRequired && !nulavelNoBanco) {
      anota(`nulabilidade: ${tabela}.${coluna} é opcional no schema e é NOT NULL no banco`)
    }
  }

  // colunas que existem no banco e ninguém declarou
  const declaradas = new Set(
    modelo.fields.filter((f) => f.kind !== 'object').map((f) => f.dbName ?? f.name),
  )
  for (const coluna of doBanco.keys()) {
    if (!declaradas.has(coluna)) anota(`coluna SOBRANDO no banco: ${tabela}.${coluna}`)
  }

  // todo @unique / @@unique precisa de índice único
  const unicos = unicosPorTabela.get(tabela) ?? new Set()
  const camposUnicos = modelo.fields.filter((f) => f.isUnique).map((f) => f.dbName ?? f.name)
  const combinacoes = (modelo.uniqueFields ?? []).map((cols) =>
    cols.map((n) => modelo.fields.find((f) => f.name === n)?.dbName ?? n),
  )
  for (const alvo of [...camposUnicos.map((c) => [c]), ...combinacoes]) {
    const esperado = `${tabela}_${alvo.join('_')}_key`
    const pk = `${tabela}_pkey`
    if (!unicos.has(esperado) && !unicos.has(pk)) {
      anota(`índice único AUSENTE: esperava "${esperado}" em ${tabela}`)
    }
  }
}

for (const tabela of porTabela.keys()) {
  if (!tabelasDoSchema.has(tabela) && tabela !== '_prisma_migrations') {
    anota(`tabela SOBRANDO no banco: "${tabela}"`)
  }
}

const totalColunas = dmmf.datamodel.models.reduce(
  (n, m) => n + m.fields.filter((f) => f.kind !== 'object').length,
  0,
)
console.log(
  `\nconferidos ${dmmf.datamodel.models.length} modelos / ${totalColunas} campos ` +
    `contra ${porTabela.size} tabelas do banco`,
)
if (problemas.length === 0) {
  console.log('schema e migrações batem — nenhuma divergência')
  process.exit(0)
}
console.error(`\n${problemas.length} divergência(s):`)
for (const p of problemas) console.error(`  - ${p}`)
process.exit(1)
