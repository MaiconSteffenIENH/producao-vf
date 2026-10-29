-- CLIENTE E FORNECEDOR VIRAM CADASTRO.
--
-- Até aqui os dois eram texto solto: `encomendas.cliente` e
-- `materias_primas.fornecedor`. Texto solto não tem telefone, não tem CNPJ, e
-- aceita "Auto Center", "auto center" e "AutoCenter" como três empresas
-- diferentes — o que impede qualquer visão de histórico por cliente.
--
-- A conversão abaixo é a parte delicada: ela cria um cadastro para cada nome
-- distinto que JÁ EXISTE e liga as linhas antigas a ele. Nada é apagado; as
-- colunas de texto continuam lá, guardando a grafia original.

CREATE TABLE "clientes" (
  "id"                 UUID         NOT NULL,
  "nome"               TEXT         NOT NULL,
  "nome_busca"         TEXT         NOT NULL DEFAULT '',
  "documento"          TEXT,
  "documento_limpo"    TEXT,
  "tipo"               TEXT         NOT NULL DEFAULT 'pj',
  "email"              TEXT,
  "telefone"           TEXT,
  "endereco"           TEXT,
  "bairro"             TEXT,
  "cidade"             TEXT,
  "uf"                 VARCHAR(2),
  "cep"                TEXT,
  "atividade"          TEXT,
  "porte"              TEXT,
  "situacao_cadastral" TEXT,
  "data_abertura"      DATE,
  "observacao"         TEXT,
  "ativo"              BOOLEAN      NOT NULL DEFAULT true,
  "criado_em"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fornecedores" (
  "id"                 UUID         NOT NULL,
  "nome"               TEXT         NOT NULL,
  "nome_busca"         TEXT         NOT NULL DEFAULT '',
  "documento"          TEXT,
  "documento_limpo"    TEXT,
  "tipo"               TEXT         NOT NULL DEFAULT 'pj',
  "email"              TEXT,
  "telefone"           TEXT,
  "endereco"           TEXT,
  "bairro"             TEXT,
  "cidade"             TEXT,
  "uf"                 VARCHAR(2),
  "cep"                TEXT,
  "atividade"          TEXT,
  "porte"              TEXT,
  "situacao_cadastral" TEXT,
  "data_abertura"      DATE,
  "observacao"         TEXT,
  "ativo"              BOOLEAN      NOT NULL DEFAULT true,
  "criado_em"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- Nome vazio viraria linha invisível na lista, ocupando espaço sem dizer de
-- quem é. Mesma trava do quadro de avisos, pelo mesmo motivo.
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_nome_preenchido_check"
  CHECK (length(btrim("nome")) > 0);
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_nome_preenchido_check"
  CHECK (length(btrim("nome")) > 0);

-- Só dois valores fazem sentido, e um terceiro escrito por engano quebraria a
-- máscara do documento na tela sem erro nenhum aparecer.
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tipo_check"
  CHECK ("tipo" IN ('pj', 'pf'));
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_tipo_check"
  CHECK ("tipo" IN ('pj', 'pf'));

-- O DOCUMENTO É ÚNICO, MAS SÓ QUANDO EXISTE.
--
-- Índice único parcial, e não UNIQUE na coluna: o ateliê tem cliente sem CNPJ
-- (a feira, o vizinho), e um UNIQUE comum trataria todos os nulos como... bem,
-- o Postgres permite vários nulos, mas o índice parcial deixa a intenção
-- explícita e não indexa linha que não tem documento.
CREATE UNIQUE INDEX "clientes_documento_limpo_key"
  ON "clientes"("documento_limpo") WHERE "documento_limpo" IS NOT NULL;
CREATE UNIQUE INDEX "fornecedores_documento_limpo_key"
  ON "fornecedores"("documento_limpo") WHERE "documento_limpo" IS NOT NULL;

CREATE INDEX "clientes_nome_busca_idx" ON "clientes"("nome_busca");
CREATE INDEX "clientes_documento_limpo_idx" ON "clientes"("documento_limpo");
CREATE INDEX "fornecedores_nome_busca_idx" ON "fornecedores"("nome_busca");
CREATE INDEX "fornecedores_documento_limpo_idx" ON "fornecedores"("documento_limpo");

-- ── a ligação com o que já existe ───────────────────────────────────────────

ALTER TABLE "encomendas"      ADD COLUMN "cliente_id"    UUID;
ALTER TABLE "materias_primas" ADD COLUMN "fornecedor_id" UUID;

ALTER TABLE "encomendas" ADD CONSTRAINT "encomendas_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "materias_primas" ADD CONSTRAINT "materias_primas_fornecedor_id_fkey"
  FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "encomendas_cliente_id_idx"         ON "encomendas"("cliente_id");
CREATE INDEX "materias_primas_fornecedor_id_idx" ON "materias_primas"("fornecedor_id");

-- ── converter o texto que já está lá ────────────────────────────────────────
--
-- O AGRUPAMENTO É PELO NOME NORMALIZADO, não pelo texto cru.
--
-- "Auto Center", "auto center" e "AUTO CENTER " são a mesma empresa, e criar
-- três cadastros seria repetir dentro do sistema exatamente a bagunça que o
-- cadastro veio resolver. A normalização aqui é a MESMA de
-- backend/src/lib/busca.ts: minúscula, sem acento, sem espaço nas pontas.
--
-- `unaccent` não é usado de propósito: ele exige extensão instalada no banco,
-- e o Neon de produção não a tem. translate() cobre as letras que aparecem em
-- nome de empresa brasileira e não depende de nada.

CREATE OR REPLACE FUNCTION pg_temp.normalizar_nome(t TEXT) RETURNS TEXT AS $$
  SELECT btrim(lower(translate(
    t,
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
  )));
$$ LANGUAGE SQL IMMUTABLE;

-- clientes, a partir das encomendas
WITH nomes AS (
  SELECT DISTINCT ON (pg_temp.normalizar_nome("cliente"))
         "cliente" AS nome, "contato"
  FROM "encomendas"
  WHERE btrim(coalesce("cliente", '')) <> ''
  ORDER BY pg_temp.normalizar_nome("cliente"), "criado_em" ASC
)
INSERT INTO "clientes" ("id", "nome", "nome_busca", "telefone", "observacao")
SELECT gen_random_uuid(),
       nome,
       pg_temp.normalizar_nome(nome),
       nullif(btrim(coalesce("contato", '')), ''),
       'Cadastro criado a partir das encomendas antigas. Confira CNPJ e endereço.'
FROM nomes;

UPDATE "encomendas" e
SET "cliente_id" = c."id"
FROM "clientes" c
WHERE c."nome_busca" = pg_temp.normalizar_nome(e."cliente");

-- fornecedores, a partir das matérias-primas
WITH nomes AS (
  SELECT DISTINCT ON (pg_temp.normalizar_nome("fornecedor")) "fornecedor" AS nome
  FROM "materias_primas"
  WHERE btrim(coalesce("fornecedor", '')) <> ''
  ORDER BY pg_temp.normalizar_nome("fornecedor"), "criado_em" ASC
)
INSERT INTO "fornecedores" ("id", "nome", "nome_busca", "observacao")
SELECT gen_random_uuid(),
       nome,
       pg_temp.normalizar_nome(nome),
       'Cadastro criado a partir das matérias-primas. Confira CNPJ e telefone.'
FROM nomes;

UPDATE "materias_primas" m
SET "fornecedor_id" = f."id"
FROM "fornecedores" f
WHERE f."nome_busca" = pg_temp.normalizar_nome(m."fornecedor");
