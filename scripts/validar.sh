#!/usr/bin/env bash
#
# Validações do Produção VF antes de ir pra branch (rodadas pelo hook pre-push).
# Backend: typecheck + testes · Frontend: typecheck + build.
# Pra pular pontualmente (não recomendado): git push --no-verify
#
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

passo() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }

passo "Backend — gerar Prisma Client"
# sem isto o tsc reclama de tipos implícitos: os tipos das queries vêm do client gerado
( cd backend && npx prisma generate )

passo "Backend — typecheck (tsc)"
( cd backend && npx tsc --noEmit )

passo "Backend — testes (vitest)"
# A suíte compartilha UM banco de teste e o vitest não garante ordem fixa entre
# os arquivos — um flake passa na 2ª rodada; regressão real falha nas duas.
if ! ( cd backend && npm test ); then
  printf '\033[1;33m↻ Falhou na 1ª rodada — pode ser flake do banco compartilhado. Rodando de novo…\033[0m\n'
  ( cd backend && npm test )
fi

passo "Frontend — typecheck (tsc -b)"
( cd frontend && npx tsc -b )

passo "Frontend — build (vite)"
( cd frontend && npm run build )

printf '\n\033[1;32m✅ Tudo validado — pode seguir.\033[0m\n'
