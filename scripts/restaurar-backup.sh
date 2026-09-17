#!/usr/bin/env bash
#
# Restaura um backup do GitHub Actions (docs/BACKUP.md) num banco Postgres.
#
#   BACKUP_SENHA='a mesma senha do segredo' \
#     scripts/restaurar-backup.sh producao-vf-2026-09-17.dump.enc "postgresql://usuario:senha@host/banco?sslmode=require"
#
# Restaure PRIMEIRO numa branch de teste do Neon e abra o sistema apontando
# para ela. Só depois, se for o caso, aponte para produção. O script mostra o
# host de destino e pede confirmação digitada; `--sim` pula a pergunta (para
# o teste mensal automatizado, não para o dia do desastre).
#
# É tudo ou nada: `--single-transaction` desfaz a restauração inteira se uma
# tabela falhar. Um banco meio restaurado é pior que o banco velho.
set -euo pipefail

ARQUIVO="${1:-}"
URL="${2:-}"
CONFIRMADO="${3:-}"

if [ -z "$ARQUIVO" ] || [ -z "$URL" ]; then
  echo "uso: BACKUP_SENHA=... $0 <arquivo.dump.enc> <url-do-banco-destino> [--sim]" >&2
  exit 2
fi
[ -f "$ARQUIVO" ] || { echo "não achei $ARQUIVO" >&2; exit 2; }
[ -n "${BACKUP_SENHA:-}" ] || { echo "defina BACKUP_SENHA (a mesma do segredo do GitHub)" >&2; exit 2; }
command -v pg_restore >/dev/null || { echo "pg_restore não está instalado (postgresql-client 17 ou mais novo)" >&2; exit 2; }

host=$(printf '%s' "$URL" | sed -E 's#^[a-z]+://([^@]*@)?([^/:?]+).*#\2#')
echo "destino: $host"
if [ "$CONFIRMADO" != "--sim" ]; then
  read -r -p "Isto APAGA o que está em $host e põe o backup no lugar. Digite 'restaurar' para seguir: " resposta
  [ "$resposta" = "restaurar" ] || { echo "cancelado."; exit 1; }
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "▶ decifrando"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$ARQUIVO" -out "$tmp/banco.dump" -pass env:BACKUP_SENHA
head -c 5 "$tmp/banco.dump" | grep -q PGDMP || { echo "o arquivo decifrado não é um dump do Postgres: senha errada?" >&2; exit 1; }

tabelas=$(pg_restore --list "$tmp/banco.dump" | grep -c 'TABLE DATA' || true)
echo "▶ $tabelas tabelas com dados no backup"

echo "▶ restaurando (tudo ou nada)"
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction \
  --dbname="$URL" "$tmp/banco.dump"

echo "✔ restaurado em $host. Abra o sistema apontando para este banco e confira o quadro e o histórico."
