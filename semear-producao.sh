#!/usr/bin/env bash
#
# Semeia o banco de PRODUÇÃO com peças, esmaltes, etapas, responsáveis e o
# usuário inicial. Rode uma vez só, depois que o Render estiver no ar.
#
#   ./semear-producao.sh
#
# Ele pergunta o que precisa — não monte comando na mão com as URLs.
#
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/backend"

passo() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
ok()    { printf '\033[1;32m  ✓ %s\033[0m\n' "$1"; }
erro()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

passo "Banco de produção"
echo "  Cole a connection string POOLED do Neon (a que tem -pooler no host)."
echo "  Ela aparece no dashboard do Neon em Connection string."
echo
read -r -p "  DATABASE_URL: " URL
URL="$(printf '%s' "$URL" | tr -d '[:space:]')"

case "$URL" in
  postgresql://*|postgres://*) ;;
  '') erro "Nada colado." ;;
  *) erro "Isso não parece uma connection string — ela começa com postgresql://" ;;
esac

# A direta é a mesma sem o -pooler: o prisma usa um advisory lock que não
# sobrevive ao PgBouncer, e sem isso a migração morre com P1002.
DIRETA="${URL//-pooler/}"

# Mostra onde vai escrever sem vazar a senha no terminal
HOST="$(printf '%s' "$URL" | sed -E 's|.*@([^/?]+).*|\1|')"
echo
printf '  Vai semear em: \033[1m%s\033[0m\n' "$HOST"
[ "$DIRETA" != "$URL" ] && ok "conexão direta derivada (sem -pooler)" || printf '\033[1;33m  ! a URL não tinha -pooler; usando ela para os dois\033[0m\n'

passo "Usuário inicial"
read -r -p "  E-mail [gabi@veraflesch.com.br]: " EMAIL
EMAIL="${EMAIL:-gabi@veraflesch.com.br}"
read -r -s -p "  Senha provisória (some da tela): " SENHA
echo
[ ${#SENHA} -ge 8 ] || erro "A senha precisa de pelo menos 8 caracteres."
echo "  O sistema vai exigir a troca dessa senha no primeiro login."

echo
read -r -p "  Confirma semear $HOST? [s/N]: " CONFIRMA
case "$CONFIRMA" in [sS]*) ;; *) erro "Cancelado." ;; esac

passo "Semeando"
DATABASE_URL="$URL" DIRECT_URL="$DIRETA" ADMIN_EMAIL="$EMAIL" ADMIN_SENHA="$SENHA" npm run seed \
  || erro "O seed falhou. Se a mensagem foi sobre tabela inexistente, o Render ainda não aplicou as migrações — confira o deploy e tente de novo."

printf '\n\033[1;32m✅ Pronto. Entre com %s e a senha que você definiu.\033[0m\n' "$EMAIL"
