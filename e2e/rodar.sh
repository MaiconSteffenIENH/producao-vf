#!/usr/bin/env bash
#
# Roda os testes de ponta a ponta na sua máquina, do zero: sobe a pilha no
# Docker (banco novo, API e web), roda o Playwright e derruba tudo no fim.
#
#   ./e2e/rodar.sh                   # a bateria inteira
#   ./e2e/rodar.sh bdd-10            # só um arquivo
#   ./e2e/rodar.sh --grep "sábado"   # só um cenário
#   MANTER=1 ./e2e/rodar.sh          # deixa a pilha no ar para investigar
#
# Precisa de Docker e de Node 20+. Na primeira vez baixa o Chromium (~150 MB).
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

command -v docker >/dev/null || { echo "Docker não encontrado."; exit 1; }

derrubar() {
  if [ "${MANTER:-0}" = "1" ]; then
    echo "pilha mantida no ar (docker compose -f docker-compose.e2e.yml down -v para derrubar)"
  else
    docker compose -f docker-compose.e2e.yml down -v >/dev/null 2>&1 || true
  fi
}
trap derrubar EXIT

echo "▶ subindo banco, API e web (a primeira vez demora: instala as dependências)"
docker compose -f docker-compose.e2e.yml down -v >/dev/null 2>&1 || true
docker compose -f docker-compose.e2e.yml up -d --wait

cd e2e
[ -d node_modules/@playwright/test ] || npm ci --no-audit --no-fund
npx playwright install chromium >/dev/null 2>&1 || npx playwright install chromium

echo "▶ Playwright"
E2E_URL=http://localhost:5173 E2E_API=http://localhost:3001 npx playwright test "$@"
