#!/usr/bin/env bash
#
# Sobe o Produção VF na sua máquina. Rode uma vez:  ./rodar-local.sh
#
# O que ele faz: confere o Node, arruma um banco, instala as dependências,
# cria as tabelas, semeia com as peças e esmaltes reais do ateliê, e deixa
# backend e frontend rodando lado a lado.
#
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

passo()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
ok()     { printf '\033[1;32m  ✓ %s\033[0m\n' "$1"; }
aviso()  { printf '\033[1;33m  ! %s\033[0m\n' "$1"; }
erro()   { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

# ─────────────────────────── 1. Node ───────────────────────────
passo "Conferindo o Node"
command -v node >/dev/null || erro "Node não encontrado. Instale o Node 20 ou mais novo: https://nodejs.org"
VERSAO=$(node -p "process.versions.node.split('.')[0]")
[ "$VERSAO" -ge 20 ] || erro "Node $VERSAO é antigo demais. Precisa de 20+."
ok "Node $(node -v)"

# ─────────────────────────── 2. Banco ──────────────────────────
passo "Arrumando o banco de dados"

if [ -f backend/.env ] && grep -q '^DATABASE_URL=.\+' backend/.env; then
  ok "backend/.env já tem DATABASE_URL — usando esse banco"
else
  echo "  Este projeto usa PostgreSQL. Duas formas de ter um:"
  echo
  echo "    1) Docker  — sobe um Postgres local aqui mesmo, sem criar conta"
  echo "    2) Neon    — banco na nuvem, grátis; é o mesmo que vai para produção"
  echo
  read -r -p "  Escolha [1/2]: " ESCOLHA

  if [ "$ESCOLHA" = "1" ]; then
    command -v docker >/dev/null || erro "Docker não encontrado. Instale-o ou escolha a opção 2 (Neon)."
    passo "Subindo o Postgres no Docker"
    docker rm -f producao-vf-db >/dev/null 2>&1
    docker run -d --name producao-vf-db \
      -e POSTGRES_PASSWORD=vf -e POSTGRES_DB=producao_vf \
      -p 5433:5432 postgres:16 >/dev/null || erro "Não deu para subir o container."
    printf '  aguardando o banco aceitar conexão'
    for _ in $(seq 1 30); do
      docker exec producao-vf-db pg_isready -U postgres >/dev/null 2>&1 && break
      printf '.'; sleep 1
    done
    echo
    URL="postgresql://postgres:vf@localhost:5433/producao_vf?schema=public"
    ok "Postgres no ar em localhost:5433"
  else
    echo
    echo "  Crie um projeto grátis em https://neon.tech e copie a connection string."
    read -r -p "  Cole aqui (a pooled, com -pooler): " URL
    [ -n "$URL" ] || erro "Sem connection string não dá para seguir."
  fi

  # DIRECT_URL: a mesma sem o -pooler. O advisory lock do prisma migrate não
  # sobrevive ao PgBouncer do Neon e estoura P1002.
  DIRETA="${URL//-pooler/}"

  cat > backend/.env <<ENV
DATABASE_URL="$URL"
DIRECT_URL="$DIRETA"
JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
CORS_ORIGIN="http://localhost:5173"
PORT=3001
NODE_ENV=development
ENV
  ok "backend/.env criado"
fi

[ -f frontend/.env ] || { echo 'VITE_API_URL=http://localhost:3001' > frontend/.env; ok "frontend/.env criado"; }

# ─────────────────────── 3. Dependências ───────────────────────
passo "Instalando dependências do backend"
( cd backend && npm install ) || erro "npm install do backend falhou."

passo "Instalando dependências do frontend"
( cd frontend && npm install ) || erro "npm install do frontend falhou."

# ──────────────────── 4. Banco: tabelas e seed ─────────────────
passo "Gerando o Prisma Client"
( cd backend && npx prisma generate ) || erro "prisma generate falhou."

passo "Criando as tabelas"
if [ -d backend/prisma/migrations ]; then
  ( cd backend && npx prisma migrate deploy ) || erro "migrate deploy falhou."
else
  # primeira vez: cria a migração oficial, que é a que o Render vai aplicar
  ( cd backend && npx prisma migrate dev --name inicial ) || erro "migrate dev falhou."
fi

passo "Semeando com as peças e esmaltes do ateliê"
( cd backend && npm run seed ) || aviso "O seed reclamou — pode ser que já estivesse semeado."

# ───────────────────── 5. Checagem rápida ──────────────────────
passo "Rodando os testes de unidade (não precisam de banco)"
( cd backend && npm run test:unidade ) || aviso "Algum teste de unidade falhou — veja acima."

# ──────────────────────── 6. Subir tudo ────────────────────────
passo "Subindo backend e frontend"
echo "  API .......... http://localhost:3001"
echo "  Aplicação .... http://localhost:5173"
echo "  Login ........ gabi@veraflesch.com.br / ceramica123 (troca no 1º acesso)"
echo
echo "  Ctrl+C encerra os dois."
echo

( cd backend && npm run dev ) &
PID_API=$!
( cd frontend && npm run dev ) &
PID_WEB=$!

encerrar() { kill "$PID_API" "$PID_WEB" 2>/dev/null; wait 2>/dev/null; echo; ok "Encerrado."; }
trap encerrar INT TERM
wait
