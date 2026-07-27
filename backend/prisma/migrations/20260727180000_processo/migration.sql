-- Fase 4 — o que o processo do ateliê pedia e o modelo não representava.
--
-- Escrita à mão: o container onde este trabalho foi feito não alcança
-- binaries.prisma.sh (403), então `prisma migrate dev` não roda ali. Em troca,
-- este arquivo foi aplicado num PostgreSQL 16 de verdade e conferido campo a
-- campo contra o DMMF do schema.prisma (scripts/conferir-schema.mjs).
-- Tudo é aditivo: nenhuma coluna existente muda de tipo, nenhuma some.

-- ─── forno: capacidade por CARGA, não por dia ───
ALTER TABLE "responsaveis" ADD COLUMN "capacidade_carga" INTEGER;
ALTER TABLE "responsaveis" ADD COLUMN "horas_por_queima" INTEGER;

-- ─── etapa que só anda quando a carga fecha ───
ALTER TABLE "etapas" ADD COLUMN "aguarda_carga" BOOLEAN NOT NULL DEFAULT false;

-- ─── insumo: prazo de entrega, para a compra não chegar tarde ───
ALTER TABLE "materias_primas" ADD COLUMN "prazo_entrega_dias" INTEGER NOT NULL DEFAULT 7;

-- ─── o ciclo da foto, na granularidade peça+cor ───
ALTER TABLE "peca_cores" ADD COLUMN "foto_status" TEXT NOT NULL DEFAULT 'pendente';
ALTER TABLE "peca_cores" ADD COLUMN "foto_url" TEXT;
ALTER TABLE "peca_cores" ADD COLUMN "foto_observacao" TEXT;
ALTER TABLE "peca_cores" ADD COLUMN "foto_atualizada_em" TIMESTAMP(3);
CREATE INDEX "peca_cores_foto_status_idx" ON "peca_cores"("foto_status");

-- ─── lote nascido de encomenda ───
ALTER TABLE "lotes" ADD COLUMN "encomenda_id" UUID;
CREATE INDEX "lotes_encomenda_id_idx" ON "lotes"("encomenda_id");

-- ─── idempotência: o reenvio da fila offline não pode gravar duas vezes ───
ALTER TABLE "movimentos_lote" ADD COLUMN "chave_idempotencia" TEXT;
CREATE UNIQUE INDEX "movimentos_lote_chave_idempotencia_key" ON "movimentos_lote"("chave_idempotencia");

-- ─── folga: dia não trabalhado abate a meta em vez de virar dívida ───
CREATE TABLE "folgas" (
    "id" UUID NOT NULL,
    "responsavel_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "motivo" TEXT NOT NULL DEFAULT 'folga',
    "observacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folgas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "folgas_responsavel_id_data_key" ON "folgas"("responsavel_id", "data");
CREATE INDEX "folgas_data_idx" ON "folgas"("data");
ALTER TABLE "folgas" ADD CONSTRAINT "folgas_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "responsaveis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── consumo de insumo por peça ───
CREATE TABLE "peca_insumos" (
    "id" UUID NOT NULL,
    "peca_id" UUID NOT NULL,
    "materia_prima_id" UUID NOT NULL,
    "quantidade_por_peca" DECIMAL(12,4) NOT NULL,
    "etapa_id" UUID,
    "cor_id" UUID,

    CONSTRAINT "peca_insumos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "peca_insumos_peca_id_materia_prima_id_cor_id_key" ON "peca_insumos"("peca_id", "materia_prima_id", "cor_id");
CREATE INDEX "peca_insumos_materia_prima_id_idx" ON "peca_insumos"("materia_prima_id");
ALTER TABLE "peca_insumos" ADD CONSTRAINT "peca_insumos_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "peca_insumos" ADD CONSTRAINT "peca_insumos_materia_prima_id_fkey" FOREIGN KEY ("materia_prima_id") REFERENCES "materias_primas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "peca_insumos" ADD CONSTRAINT "peca_insumos_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "etapas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "peca_insumos" ADD CONSTRAINT "peca_insumos_cor_id_fkey" FOREIGN KEY ("cor_id") REFERENCES "cores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── a fornada ───
CREATE TABLE "queimas" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planejada',
    "forno_id" UUID,
    "capacidade" INTEGER NOT NULL,
    "prevista_para" TIMESTAMP(3),
    "iniciada_em" TIMESTAMP(3),
    "concluida_em" TIMESTAMP(3),
    "observacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queimas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "queimas_codigo_key" ON "queimas"("codigo");
CREATE INDEX "queimas_status_idx" ON "queimas"("status");
ALTER TABLE "queimas" ADD CONSTRAINT "queimas_forno_id_fkey" FOREIGN KEY ("forno_id") REFERENCES "responsaveis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "queima_itens" (
    "id" UUID NOT NULL,
    "queima_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "quantidade" INTEGER NOT NULL,

    CONSTRAINT "queima_itens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "queima_itens_queima_id_lote_id_key" ON "queima_itens"("queima_id", "lote_id");
CREATE INDEX "queima_itens_lote_id_idx" ON "queima_itens"("lote_id");
ALTER TABLE "queima_itens" ADD CONSTRAINT "queima_itens_queima_id_fkey" FOREIGN KEY ("queima_id") REFERENCES "queimas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "queima_itens" ADD CONSTRAINT "queima_itens_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── venda: o lado que faltava para "comparar produção com vendas" ───
CREATE TABLE "vendas" (
    "id" UUID NOT NULL,
    "peca_id" UUID NOT NULL,
    "cor_id" UUID,
    "canal_id" UUID,
    "competencia" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "valor_total" DECIMAL(12,2),
    "origem" TEXT NOT NULL DEFAULT 'manual',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendas_pkey" PRIMARY KEY ("id")
);
-- NULLS NOT DISTINCT: cor_id e canal_id são opcionais, e sem isto o Postgres
-- trataria cada NULL como valor único — reimportar a mesma planilha criaria
-- linha nova em vez de corrigir a existente.
CREATE UNIQUE INDEX "vendas_peca_id_cor_id_canal_id_competencia_key" ON "vendas"("peca_id", "cor_id", "canal_id", "competencia") NULLS NOT DISTINCT;
CREATE INDEX "vendas_competencia_idx" ON "vendas"("competencia");
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_cor_id_fkey" FOREIGN KEY ("cor_id") REFERENCES "cores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canais_venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── encomenda com prazo ───
CREATE TABLE "encomendas" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "contato" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "entregar_ate" DATE,
    "observacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entregue_em" TIMESTAMP(3),

    CONSTRAINT "encomendas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "encomendas_codigo_key" ON "encomendas"("codigo");
CREATE INDEX "encomendas_status_idx" ON "encomendas"("status");

CREATE TABLE "encomenda_itens" (
    "id" UUID NOT NULL,
    "encomenda_id" UUID NOT NULL,
    "peca_id" UUID NOT NULL,
    "cor_id" UUID,
    "quantidade" INTEGER NOT NULL,

    CONSTRAINT "encomenda_itens_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "encomenda_itens_encomenda_id_idx" ON "encomenda_itens"("encomenda_id");
ALTER TABLE "encomenda_itens" ADD CONSTRAINT "encomenda_itens_encomenda_id_fkey" FOREIGN KEY ("encomenda_id") REFERENCES "encomendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "encomenda_itens" ADD CONSTRAINT "encomenda_itens_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "encomenda_itens" ADD CONSTRAINT "encomenda_itens_cor_id_fkey" FOREIGN KEY ("cor_id") REFERENCES "cores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lotes" ADD CONSTRAINT "lotes_encomenda_id_fkey" FOREIGN KEY ("encomenda_id") REFERENCES "encomendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
