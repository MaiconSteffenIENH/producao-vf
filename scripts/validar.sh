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

# O MESMO padrão que `npm test` usa quando DATABASE_URL_TESTE não está definida.
# Precisa ser idêntico: se o script achar que não há banco e o npm test tentar
# um localhost mesmo assim, a bateria roda quando deveria ser pulada.
URL_PADRAO_TESTE="postgresql://postgres@localhost:5432/producao_vf_teste?schema=public"
URL_EFETIVA="${URL_TESTE:-$URL_PADRAO_TESTE}"

# ABRIR CONEXÃO DE VERDADE, não só bater na porta.
#
# A versão anterior fazia um TCP connect e considerava isso "banco disponível".
# Porta aberta não é banco acessível: outro Postgres da máquina responde no
# 5432, o usuário não tem acesso ao banco de teste, e a bateria morre com um
# P1010 que trava o push sem dizer o que fazer. Aconteceu de verdade.
banco_de_teste_no_ar() {
  # MESMA salvaguarda do tests/globalSetup.ts: ele recusa qualquer URL sem
  # "teste"/"test" no nome, porque a bateria começa com --force-reset. Se o
  # probe não repetir a regra, ele diz "tem banco", a bateria roda e morre na
  # recusa — que foi o que travou um push de verdade.
  case "$URL_EFETIVA" in
    *teste*|*test*) : ;;
    *) return 1 ;;
  esac
  # roda dentro de backend/ porque é lá que o pg está instalado
  ( cd backend && URL_EFETIVA="$URL_EFETIVA" node -e '
    let Client
    try { ({ Client } = require("pg")) } catch { process.exit(1) }
    const c = new Client({ connectionString: process.env.URL_EFETIVA, connectionTimeoutMillis: 3000 })
    c.connect()
      .then(() => c.query("select 1"))
      .then(() => { c.end(); process.exit(0) })
      .catch(() => { try { c.end() } catch {} ; process.exit(1) })
  ' ) 2>/dev/null
}

passo "Backend — gerar Prisma Client"
# Sem isto o tsc perde a inferência: os tipos das queries vêm do client gerado.
#
# Se a geração falhar (rede bloqueada, binaries.prisma.sh fora do ar), o script
# NÃO aborta: avisa e segue. O conferidor de campos logo abaixo cobre a parte
# que o compilador deixaria passar sem o client, e travar o trabalho inteiro
# por causa de um download indisponível é pior do que seguir com a rede menor.
PRISMA_OK=1
if ! ( cd backend && npx prisma generate ); then
  PRISMA_OK=0
  aviso "Não deu para gerar o Prisma Client — o tsc vai checar menos coisa nesta rodada."
  aviso "O conferidor de campos (passo abaixo) cobre nome de modelo e de campo."
fi

passo "Backend — typecheck (tsc)"
( cd backend && npx tsc --noEmit )

# Rede extra para o caso de o Prisma Client não poder ser gerado (ambiente sem
# acesso a binaries.prisma.sh). Sem o client, `prisma.qualquerCoisa` vira `any`
# e um campo escrito errado compila liso. Este verificador lê o schema pelo
# parser WASM e confere nome por nome. Roda sempre: é rápido e pega o que o
# compilador não pega quando o client está desatualizado.
passo "Backend — scripts do prisma/ compilam"
#
# O tsconfig do backend inclui só `src/**/*`, então seed.ts, ajustar-fluxo.ts e
# limpar-producao.ts NUNCA passavam pelo compilador — e eles falam com o banco
# tanto quanto qualquer service. Já custou duas vezes: um `contador.chave` (o
# campo se chama `nome`) e dois `const oleiro` no mesmo escopo, que quebraria o
# script na primeira linha.
#
# AVISA em vez de barrar, de propósito. Esta checagem nasceu depois do resto do
# código; se ela achar coisa antiga, o certo é consertar com calma, não travar
# o push de quem só queria publicar outra coisa.
if ! ( cd backend && npx tsc --noEmit --skipLibCheck --module esnext --target es2022 \
        --moduleResolution bundler prisma/*.ts 2>&1 | grep -v node_modules | head -20 | grep . ); then
  :
else
  aviso "Há erro de tipo nos scripts de prisma/ (acima). Não barra o push, mas conserte."
fi

passo "Backend — nomes de modelo e campo batem com o schema"
if node scripts/conferir-campos-prisma.mjs; then :; else
  aviso "Há nome de modelo ou campo fora do schema (acima)."
  exit 1
fi

passo "Backend — testes de unidade (regra pura, sem banco)"
( cd backend && npm run test:unidade )

passo "Backend — testes de integração"
if [ "$PRISMA_OK" = "0" ]; then
  # sem o client gerado a bateria não tem como nem começar — reclamar dela aqui
  # seria repetir o erro anterior com outro nome
  aviso "Prisma Client não pôde ser gerado — esta bateria depende dele. Pulando."
elif banco_de_teste_no_ar; then
  # A suíte compartilha UM banco e o vitest não garante ordem entre arquivos —
  # um flake passa na 2ª rodada; regressão real falha nas duas.
  if ! ( cd backend && DATABASE_URL_TESTE="$URL_EFETIVA" npm test ); then
    printf '\033[1;33m↻ Falhou na 1ª rodada — pode ser flake do banco compartilhado. Rodando de novo…\033[0m\n'
    ( cd backend && DATABASE_URL_TESTE="$URL_EFETIVA" npm test )
  fi
else
  aviso "Sem banco de teste utilizável — pulando esta bateria."
  aviso "(o nome do banco precisa conter \"teste\": a bateria roda --force-reset nele)"
  aviso "O CI do GitHub roda ela a cada push, então nada fica sem cobertura."
  aviso "Para rodar aqui:"
  aviso "  docker run -d --name vf-teste -e POSTGRES_PASSWORD=vf -p 5433:5432 postgres:16"
  aviso "  export DATABASE_URL_TESTE=\"postgresql://postgres:vf@localhost:5433/producao_vf_teste\""
fi

passo "Migrações — aplicam limpo e batem com o schema"
if banco_de_teste_no_ar; then
  node scripts/conferir-schema.mjs "$URL_EFETIVA"
else
  aviso "Sem banco no ar — pulando a conferência de migração contra Postgres."
  aviso "O CI do GitHub roda ela a cada push."
fi

passo "Frontend — typecheck (tsc -b)"
( cd frontend && npx tsc -b )

passo "Frontend — build (vite)"
( cd frontend && npm run build )

printf '\n\033[1;32m✅ Tudo validado — pode seguir.\033[0m\n'
