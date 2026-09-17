# Backup do banco

O Neon gratuito guarda só algumas horas de histórico. Um comando errado à
noite não tem para onde voltar de manhã. Por isso o GitHub Actions faz um
backup por dia, cifrado, e guarda por 90 dias. Custa zero.

## O que roda

`.github/workflows/backup.yml`, todo dia às 00:15 de Novo Hamburgo (03:15 UTC),
e também à mão em **Actions → Backup do banco → Run workflow**.

1. `pg_dump` em formato custom (o que o `pg_restore` lê tabela a tabela).
2. Conferência: mais de 20 tabelas com dados e o livro-razão (`movimentos_lote`)
   presente. Dump vazio não vira backup.
3. Cifra com AES-256 e a senha do segredo `BACKUP_SENHA`; decifra de volta
   para provar que abre.
4. Guarda como artefato `backup-producao-vf-AAAA-MM-DD`, 90 dias.

## O que você precisa cadastrar (uma vez)

Em **Settings → Secrets and variables → Actions → New repository secret**:

| segredo | valor |
|---|---|
| `DATABASE_URL_BACKUP` | a URL **direta** do Neon (host sem `-pooler`), a mesma `DIRECT_URL` do Render |
| `BACKUP_SENHA` | uma frase longa (16+ caracteres). Guarde no gerenciador de senhas: sem ela o arquivo não abre |

Cole os dois direto no painel do GitHub. Nunca por chat, e-mail ou commit.

Depois de cadastrar, rode uma vez à mão (Run workflow) e veja o artefato
aparecer no fim da página da execução.

## Como restaurar

Precisa de `pg_restore` 17 ou mais novo na sua máquina (`brew install
postgresql@17` no Mac).

1. Em **Actions → Backup do banco**, abra a execução do dia que você quer e
   baixe o artefato. Descompacte: sai `producao-vf-AAAA-MM-DD.dump.enc`.
2. No Neon, crie uma **branch** a partir de produção (Branches → Create) e
   copie a URL direta dela. Restaure ali primeiro:

   ```bash
   BACKUP_SENHA='a frase do segredo' \
     scripts/restaurar-backup.sh producao-vf-2026-09-17.dump.enc "postgresql://...branch-de-teste...?sslmode=require"
   ```

3. Aponte a API local para essa branch (`DATABASE_URL` e `DIRECT_URL` no
   `backend/.env`), suba com `./rodar-local.sh` e confira o quadro, o histórico
   e as vendas.
4. Só então, se for restaurar produção de verdade: rode o mesmo comando com a
   URL direta de produção. O script mostra o host e pede que você digite
   `restaurar`. É tudo ou nada: se uma tabela falhar, nada muda.

Depois de restaurar produção, o app é PWA e pode estar com tela em cache:
Cmd+Shift+R nos celulares do ateliê.

## Teste mensal

Backup que nunca foi restaurado é uma esperança, não um backup. Uma vez por
mês, faça os passos 1 a 3 acima numa branch do Neon e apague a branch depois.
Leva dez minutos.

## Limites que valem saber

- O artefato some depois de 90 dias. Para guardar mais que isso, baixe o
  arquivo do fim de cada mês e ponha no Drive do ateliê (ele está cifrado).
- O plano gratuito do Actions dá 2.000 minutos por mês; cada backup usa menos
  de um.
- Se o Neon trocar a versão do Postgres, o `pg_dump` do job precisa acompanhar
  (o passo "Cliente do Postgres 17" do workflow).
