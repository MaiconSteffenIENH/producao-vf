#!/usr/bin/env bash
#
# Confere se o projeto está pronto para ir ao ar e imprime as variáveis de
# ambiente prontas para colar no Render e na Vercel.
#
#   ./preparar-deploy.sh
#
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

passo() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
ok()    { printf '\033[1;32m  ✓ %s\033[0m\n' "$1"; }
falha() { printf '\033[1;31m  ✗ %s\033[0m\n' "$1"; PROBLEMAS=$((PROBLEMAS + 1)); }
nota()  { printf '\033[1;33m  ! %s\033[0m\n' "$1"; }

PROBLEMAS=0

# ── 1. A migração está no repositório? ─────────────────────────
passo "Migração do banco"
if [ -d backend/prisma/migrations ] && [ -n "$(ls -A backend/prisma/migrations 2>/dev/null)" ]; then
  ok "backend/prisma/migrations existe ($(find backend/prisma/migrations -name migration.sql | wc -l | tr -d ' ') migração(ões))"
  if git ls-files --error-unmatch backend/prisma/migrations >/dev/null 2>&1; then
    ok "e está versionada"
  else
    falha "existe mas NÃO está no git — o Render sobe com banco vazio"
    nota "conserte com:  git add backend/prisma/migrations && git commit -m 'chore: migração inicial'"
  fi
else
  falha "não existe — o Render aplicaria nada e a API subiria com o banco vazio"
  nota "conserte rodando ./rodar-local.sh (ele cria a migração inicial), depois commite"
fi

# ── 2. Configuração de deploy ──────────────────────────────────
passo "Arquivos de configuração"
[ -f render.yaml ]        && ok "render.yaml (blueprint da API)"        || falha "render.yaml sumiu"
[ -f frontend/vercel.json ] && ok "frontend/vercel.json (rotas da SPA)" || falha "frontend/vercel.json sumiu"

# ── 3. Nada de segredo indo junto ──────────────────────────────
passo "Segredos"
if git ls-files | grep -qE '(^|/)\.env$'; then
  falha "há um .env versionado — tire do git antes de publicar"
else
  ok "nenhum .env versionado"
fi

# ── 4. O código compila? ───────────────────────────────────────
passo "Compilação"
if [ -d backend/node_modules ] && [ -d frontend/node_modules ]; then
  ( cd backend && npx prisma generate >/dev/null 2>&1 && npx tsc --noEmit ) \
    && ok "backend compila" || falha "backend não compila"
  ( cd frontend && npx tsc -b >/dev/null 2>&1 && npm run build >/dev/null 2>&1 ) \
    && ok "frontend compila e builda" || falha "frontend não compila"
  ( cd backend && npm run test:unidade >/dev/null 2>&1 ) \
    && ok "testes de unidade passam" || falha "testes de unidade falham"
else
  nota "dependências não instaladas — rode ./rodar-local.sh antes para checar a compilação"
fi

# ── 5. Tudo commitado? ─────────────────────────────────────────
passo "Git"
if [ -z "$(git status --porcelain)" ]; then
  ok "árvore limpa"
else
  nota "há mudanças não commitadas:"
  git status --short | sed 's/^/      /'
fi
if git rev-parse '@{u}' >/dev/null 2>&1; then
  PENDENTES=$(git rev-list '@{u}..HEAD' --count)
  [ "$PENDENTES" -eq 0 ] && ok "nada pendente de push" || nota "$PENDENTES commit(s) ainda não enviados — dê git push"
else
  nota "branch sem remoto configurado"
fi

# ── 6. Variáveis prontas para colar ────────────────────────────
NOME_API="producao-vf-api"
NOME_WEB="producao-vf"

cat <<TEXTO

────────────────────────────────────────────────────────────────
 VARIÁVEIS PARA COLAR
────────────────────────────────────────────────────────────────

 RENDER  →  serviço "${NOME_API}"  →  Environment

   DATABASE_URL   a connection string POOLED do Neon (host com -pooler)
   DIRECT_URL     a mesma, SEM o -pooler   ← sem isso o deploy morre com P1002
   CORS_ORIGIN    https://${NOME_WEB}.vercel.app
   NODE_ENV       production                (já vem do render.yaml)
   JWT_SECRET     não preencha — o Render gera

 VERCEL  →  projeto "${NOME_WEB}"

   Root Directory   frontend                ← o passo mais esquecido
   VITE_API_URL     https://${NOME_API}.onrender.com    (sem barra no fim)

 Depois que a Vercel te der a URL final, volte no Render e ajuste
 CORS_ORIGIN para a URL real. Barra no fim faz diferença.

 SEMEAR O BANCO DE PRODUÇÃO (uma vez só, depois que a API estiver no ar):

   ./semear-producao.sh        ← ele pergunta o que precisa; não monte na mão

 Passo a passo completo: docs/DEPLOY.md
────────────────────────────────────────────────────────────────
TEXTO

if [ "$PROBLEMAS" -gt 0 ]; then
  printf '\n\033[1;31m✗ %s ponto(s) para resolver antes de publicar.\033[0m\n' "$PROBLEMAS"
  exit 1
fi
printf '\n\033[1;32m✅ Pronto para publicar.\033[0m\n'
