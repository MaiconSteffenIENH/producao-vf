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
RAIZ="$(pwd)"

passo()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
ok()     { printf '\033[1;32m  ✓ %s\033[0m\n' "$1"; }
aviso()  { printf '\033[1;33m  ! %s\033[0m\n' "$1"; }
erro()   { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

# Instala tolerando o problema mais comum no macOS: ~/.npm/_cacache com
# arquivos pertencendo ao root (sobra de um "sudo npm install" antigo). O npm
# então falha com EACCES/EEXIST ao tentar reescrever o próprio cache. Um cache
# dentro do projeto contorna sem precisar de sudo e sem mexer no seu sistema.
instalar() {
  local pasta="$1"
  ( cd "$pasta" && npm install ) && return 0

  aviso "npm install falhou — provavelmente o cache global. Tentando com um cache do projeto…"
  ( cd "$pasta" && npm install --cache "$RAIZ/.npm-cache" ) && {
    ok "Instalado usando .npm-cache (o cache global segue quebrado; veja o final)"
    CACHE_QUEBRADO=1
    return 0
  }
  return 1
}
CACHE_QUEBRADO=0

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
    # banco separado só para a bateria de integração — ela apaga tudo a cada rodada
    docker exec producao-vf-db psql -U postgres -c 'CREATE DATABASE producao_vf_teste' >/dev/null 2>&1
    URL_TESTE="postgresql://postgres:vf@localhost:5433/producao_vf_teste?schema=public"
    ok "Postgres no ar em localhost:5433 (com banco de teste)"
  else
    URL_TESTE=""
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
${URL_TESTE:+DATABASE_URL_TESTE="$URL_TESTE"}
ENV
  ok "backend/.env criado"
fi

[ -f frontend/.env ] || { echo 'VITE_API_URL=http://localhost:3001' > frontend/.env; ok "frontend/.env criado"; }

# ─────────────────────── 3. Dependências ───────────────────────
passo "Instalando dependências do backend"
instalar backend || erro "npm install do backend falhou mesmo com cache alternativo. Veja o log acima."

passo "Instalando dependências do frontend"
instalar frontend || erro "npm install do frontend falhou mesmo com cache alternativo."

# ──────────────────── 4. Banco: tabelas e seed ─────────────────
passo "Gerando o Prisma Client"
( cd backend && npx prisma generate ) || erro "prisma generate falhou."

passo "Criando as tabelas"
if [ -d backend/prisma/migrations ]; then
  ( cd backend && npx prisma migrate deploy ) || erro "migrate deploy falhou."
else
  # primeira vez: cria a migração oficial, que é a que o Render vai aplicar
  ( cd backend && npx prisma migrate dev --name inicial ) || erro "migrate dev falhou."
  MIGRACAO_NOVA=1
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

if [ "$MIGRACAO_NOVA" = "1" ]; then
  aviso "A migração inicial foi criada em backend/prisma/migrations."
  aviso "COMMITE essa pasta antes de publicar — sem ela o Render sobe com o banco vazio:"
  aviso "  git add backend/prisma/migrations && git commit -m 'chore: migracao inicial' && git push"
  echo
fi

if [ "$CACHE_QUEBRADO" = "1" ]; then
  aviso "Seu cache global do npm está com dono errado (sobra de algum sudo npm install)."
  aviso "Para consertar de vez, um dia calmo:  sudo chown -R \$(id -u):\$(id -g) ~/.npm"
fi

encerrar() { kill "$PID_API" "$PID_WEB" 2>/dev/null; wait 2>/dev/null; echo; ok "Encerrado."; }
trap encerrar INT TERM
wait
