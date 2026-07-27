#!/usr/bin/env bash
#
# Validações do Produção VF antes de ir pra branch (rodadas pelo hook pre-push).
#
# A bateria de integração precisa de um Postgres de teste. Se não houver um
# configurado, ela é PULADA com aviso em vez de barrar o push: o CI do GitHub
# roda essa bateria com um Postgres descartável a cada push, então a cobertura
# não se perde — e ninguém fica impedido de publicar por não ter banco local.
#
# Para rodar tudo aqui, aponte DATABASE_URL_TESTE para um banco descartável
# (o ./rodar-local.sh cria um se você escolher a opção do Docker).
#
# Pra pular tudo pontualmente: git push --no-verify
#
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

passo() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
aviso() { printf '\033[1;33m  ! %s\033[0m\n' "$1"; }

URL_TESTE="${DATABASE_URL_TESTE:-}"
if [ -z "$URL_TESTE" ] && [ -f backend/.env ]; then
  URL_TESTE="$(grep -E '^DATABASE_URL_TESTE=' backend/.env | head -1 | cut -d= -f2- | tr -d '"' || true)"
fi

# Só considera "disponível" se houver alguém escutando na porta. Sem isso o
# vitest morre no globalSetup com um P1010 que não diz o que fazer.
banco_de_teste_no_ar() {
  [ -n "$URL_TESTE" ] || return 1
  URL_TESTE="$URL_TESTE" node -e '
    const net = require("net")
    let u; try { u = new URL(process.env.URL_TESTE) } catch { process.exit(1) }
    const s = net.connect({ host: u.hostname, port: Number(u.port) || 5432 })
    s.on("connect", () => { s.end(); process.exit(0) })
    s.on("error", () => process.exit(1))
    setTimeout(() => process.exit(1), 3000)
  ' 2>/dev/null
}

passo "Backend — gerar Prisma Client"
# sem isto o tsc reclama de tipos implícitos: os tipos das queries vêm do client gerado
( cd backend && npx prisma generate )

passo "Backend — typecheck (tsc)"
( cd backend && npx tsc --noEmit )

passo "Backend — testes de unidade (regra pura, sem banco)"
( cd backend && npm run test:unidade )

passo "Backend — testes de integração"
if banco_de_teste_no_ar; then
  # A suíte compartilha UM banco e o vitest não garante ordem entre arquivos —
  # um flake passa na 2ª rodada; regressão real falha nas duas.
  if ! ( cd backend && DATABASE_URL_TESTE="$URL_TESTE" npm test ); then
    printf '\033[1;33m↻ Falhou na 1ª rodada — pode ser flake do banco compartilhado. Rodando de novo…\033[0m\n'
    ( cd backend && DATABASE_URL_TESTE="$URL_TESTE" npm test )
  fi
else
  aviso "Sem banco de teste no ar — pulando esta bateria."
  aviso "O CI do GitHub roda ela a cada push, então nada fica sem cobertura."
  aviso "Para rodar aqui, aponte DATABASE_URL_TESTE para um Postgres descartável."
fi

passo "Frontend — typecheck (tsc -b)"
( cd frontend && npx tsc -b )

passo "Frontend — build (vite)"
( cd frontend && npm run build )

printf '\n\033[1;32m✅ Tudo validado — pode seguir.\033[0m\n'
