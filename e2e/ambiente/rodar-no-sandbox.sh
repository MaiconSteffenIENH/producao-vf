#!/usr/bin/env bash
#
# Roda os testes E2E do Produção VF no ambiente do assistente (Linux arm64,
# sem Docker, sem sudo, sem acesso a binaries.prisma.sh, e onde todo processo
# morre ao fim de cada chamada). Por isso tudo acontece numa chamada só:
#
#   prepara (cópias em /tmp, cacheadas) → sobe → roda o Playwright → derruba
#
# Na sua máquina não use isto: use o docker compose (veja e2e/README.md).
#
# O que muda em relação ao projeto de verdade, só nas cópias em /tmp:
#   - client Prisma com engineType = "client" + @prisma/adapter-pg (motor em
#     WASM, sem binário nativo); o repo continua com o motor padrão
#   - stubs no lugar dos binários do Prisma, só para o CLI não tentar baixar
#   - libXdamage.so.1 vazia em /tmp/libs, única lib que falta ao chromium
#
# Uso: bash rodar-no-sandbox.sh [args do playwright]
#      ex.: bash rodar-no-sandbox.sh avisos --grep "sábado"
set -uo pipefail
REPO=/sessions/festive-sweet-shannon/mnt/producao-vf
E2E=$REPO/e2e
BE=/tmp/be
FE=/tmp/fe
LIBS=/tmp/libs
DB_URL="postgresql://vf:vf@localhost:55432/producao_vf_e2e?schema=public"
export PRISMA_QUERY_ENGINE_LIBRARY=$BE/node_modules/prisma/libquery_engine-linux-arm64-openssl-3.0.x.so.node
export PRISMA_SCHEMA_ENGINE_BINARY=$BE/node_modules/prisma/schema-engine-linux-arm64-openssl-3.0.x
export PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
export LD_LIBRARY_PATH=$LIBS

parar() {
  pkill -f "tsx src/server.ts" 2>/dev/null
  pkill -f "vite preview" 2>/dev/null
  pkill -f "pgup.js" 2>/dev/null
  pkill -f "postgres -D" 2>/dev/null
  sleep 1
  rm -f /tmp/.s.PGSQL.55432* /sessions/festive-sweet-shannon/pgdata/postmaster.pid
}
trap parar EXIT
parar

# ── libXdamage (stub) ─────────────────────────────────────────────────────────
if [ ! -f $LIBS/libXdamage.so.1 ]; then
  mkdir -p $LIBS && cd $LIBS
  cat > xdamage.c <<'C'
typedef int Bool; typedef unsigned long XID; typedef XID Damage; typedef XID Drawable; typedef struct _XDisplay Display;
Bool XDamageQueryExtension(Display *d, int *eb, int *er) { (void)d; if (eb) *eb = 0; if (er) *er = 0; return 0; }
int XDamageQueryVersion(Display *d, int *ma, int *mi) { (void)d; if (ma) *ma = 1; if (mi) *mi = 1; return 0; }
Damage XDamageCreate(Display *d, Drawable w, int level) { (void)d; (void)w; (void)level; return 0; }
void XDamageDestroy(Display *d, Damage dm) { (void)d; (void)dm; }
void XDamageSubtract(Display *d, Damage dm, XID repair, XID parts) { (void)d; (void)dm; (void)repair; (void)parts; }
void XDamageAdd(Display *d, Drawable w, XID region) { (void)d; (void)w; (void)region; }
C
  gcc -shared -fPIC -o libXdamage.so.1 xdamage.c
fi

# ── backend ───────────────────────────────────────────────────────────────────
mkdir -p $BE
MUDOU_BE=$(rsync -ai --delete --exclude node_modules --exclude dist $REPO/backend/ $BE/ | grep -c '^>f' || true)
cd $BE
if [ ! -d node_modules/@prisma/adapter-pg ]; then
  echo "▶ instalando dependências do backend (uma vez)"
  npm ci --ignore-scripts --no-audit --no-fund >/dev/null 2>&1
  npm install --no-save --ignore-scripts --no-audit --no-fund @prisma/adapter-pg@6.19.3 >/dev/null 2>&1
  for f in node_modules/prisma/libquery_engine-linux-arm64-openssl-3.0.x.so.node node_modules/prisma/schema-engine-linux-arm64-openssl-3.0.x; do printf 'stub' > $f; chmod +x $f; done
  MUDOU_BE=1
fi
sed -i 's/provider = "prisma-client-js"$/provider = "prisma-client-js"\n  engineType = "client"/' prisma/schema.prisma
cat > src/lib/prisma.ts <<'TS'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
// versão do ambiente de e2e: adapter pg + motor em WASM (sem binário nativo)
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
export const prisma = new PrismaClient({ adapter, log: ['error'] })
TS
sed -i "s#^const prisma = new PrismaClient()#import { PrismaPg } from '@prisma/adapter-pg'\nconst prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })#" prisma/seed.ts
if [ "$MUDOU_BE" != "0" ] || [ ! -d node_modules/.prisma/client ]; then
  rm -rf node_modules/.prisma
  DATABASE_URL=$DB_URL DIRECT_URL=$DB_URL npx prisma generate >/dev/null 2>&1 || { echo "prisma generate falhou"; exit 1; }
fi

# ── frontend ──────────────────────────────────────────────────────────────────
mkdir -p $FE
MUDOU_FE=$(rsync -ai --delete --exclude node_modules --exclude dist $REPO/frontend/ $FE/ | grep -c '^>f' || true)
cd $FE
[ -d node_modules/vite ] || { echo "▶ instalando dependências do frontend (uma vez)"; npm ci --no-audit --no-fund >/dev/null 2>&1; MUDOU_FE=1; }
if [ "$MUDOU_FE" != "0" ] || [ ! -d dist ]; then
  echo "▶ build do frontend"
  VITE_API_URL=http://localhost:3001 npx vite build > /tmp/fe-build.log 2>&1 || { echo "build falhou"; tail -20 /tmp/fe-build.log; exit 1; }
fi

# ── e2e (deps) ────────────────────────────────────────────────────────────────
cd $E2E
[ -d node_modules/@playwright/test ] || { echo "▶ instalando o playwright (uma vez)"; npm install --no-audit --no-fund >/dev/null 2>&1; }

# ── sobe ──────────────────────────────────────────────────────────────────────
node /sessions/festive-sweet-shannon/doc/pgup.js > /tmp/pg.log 2>&1 &
for i in $(seq 1 60); do grep -q PRONTO /tmp/pg.log 2>/dev/null && break; sleep 1; done
grep -q PRONTO /tmp/pg.log || { echo "postgres não subiu"; tail -5 /tmp/pg.log; exit 1; }

cd $BE
node - <<'JS'
const { Client } = require('/tmp/be/node_modules/pg')
const fs = require('fs'), path = require('path')
;(async () => {
  const admin = new Client({ connectionString: 'postgresql://vf:vf@localhost:55432/postgres' })
  await admin.connect()
  await admin.query('drop database if exists producao_vf_e2e')
  await admin.query('create database producao_vf_e2e')
  await admin.end()
  const c = new Client({ connectionString: 'postgresql://vf:vf@localhost:55432/producao_vf_e2e' })
  await c.connect()
  const dir = '/tmp/be/prisma/migrations'
  for (const m of fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'migration.sql'))).sort()) {
    await c.query(fs.readFileSync(path.join(dir, m, 'migration.sql'), 'utf8'))
  }
  await c.end()
})().catch((e) => { console.error(e); process.exit(1) })
JS
DATABASE_URL=$DB_URL DIRECT_URL=$DB_URL JWT_SECRET=segredo-e2e npx tsx prisma/seed.ts > /tmp/seed.log 2>&1 || { echo "seed falhou"; tail -20 /tmp/seed.log; exit 1; }

DATABASE_URL=$DB_URL DIRECT_URL=$DB_URL JWT_SECRET=segredo-e2e CORS_ORIGIN=http://localhost:5173 PORT=3001 NODE_ENV=test \
  npx tsx src/server.ts > /tmp/api.log 2>&1 &
cd $FE && npx vite preview --port 5173 --strictPort > /tmp/fe.log 2>&1 &
for i in $(seq 1 40); do curl -s -o /dev/null http://localhost:3001/ && curl -s -o /dev/null http://localhost:5173/ && break; sleep 1; done
curl -s -o /dev/null http://localhost:3001/ || { echo "API não subiu"; tail -20 /tmp/api.log; exit 1; }

# ── roda ──────────────────────────────────────────────────────────────────────
cd $E2E
export E2E_URL=http://localhost:5173 E2E_API=http://localhost:3001 E2E_DB_URL="$DB_URL"
# `sh <comando>` roda um comando qualquer com a pilha no ar (para explorar a API)
if [ "${1:-}" = "sh" ]; then shift; bash -c "$*"; exit $?; fi
npx playwright test "$@"
