-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "papel_id" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "precisa_trocar_senha" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "papeis" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "admin" BOOLEAN NOT NULL DEFAULT false,
    "protegido" BOOLEAN NOT NULL DEFAULT false,
    "permissoes" JSONB NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "papeis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_atividade" (
    "id" UUID NOT NULL,
    "usuario_id" UUID,
    "usuario_nome" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "entidade_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_atividade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cores" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "nome_busca" TEXT NOT NULL DEFAULT '',
    "hex" TEXT NOT NULL DEFAULT '#CCCCCC',
    "amostra_url" TEXT,
    "malhado" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responsaveis" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "nome_busca" TEXT NOT NULL DEFAULT '',
    "tipo" TEXT NOT NULL DEFAULT 'pessoa',
    "cor" TEXT NOT NULL DEFAULT '#BBA58C',
    "capacidade_diaria" INTEGER,
    "usuario_id" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responsaveis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapas" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'producao',
    "ordem_padrao" INTEGER NOT NULL DEFAULT 0,
    "define_cor" BOOLEAN NOT NULL DEFAULT false,
    "estoque_intermediario" BOOLEAN NOT NULL DEFAULT false,
    "responsavel_padrao_id" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etapas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pecas" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "nome_busca" TEXT NOT NULL DEFAULT '',
    "categoria_id" UUID NOT NULL,
    "responsavel_inicial_id" UUID,
    "tempo_medio_dias" INTEGER NOT NULL DEFAULT 30,
    "qtd_minima_desejada" INTEGER NOT NULL DEFAULT 0,
    "qtd_minima_biscoito" INTEGER NOT NULL DEFAULT 0,
    "preco_base" DECIMAL(10,2),
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pecas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roteiro_etapas" (
    "id" UUID NOT NULL,
    "peca_id" UUID NOT NULL,
    "etapa_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "responsavel_id" UUID,
    "dias_estimados" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "roteiro_etapas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peca_cores" (
    "id" UUID NOT NULL,
    "peca_id" UUID NOT NULL,
    "cor_id" UUID NOT NULL,
    "qtd_minima_desejada" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "peca_cores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materias_primas" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "nome_busca" TEXT NOT NULL DEFAULT '',
    "tipo" TEXT NOT NULL DEFAULT 'esmalte',
    "unidade" TEXT NOT NULL DEFAULT 'kg',
    "estoque_atual" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "estoque_minimo" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "fornecedor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "materias_primas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "peca_id" UUID NOT NULL,
    "cor_id" UUID,
    "quantidade_inicial" INTEGER NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'manual',
    "lote_origem_id" UUID,
    "observacao" TEXT,
    "iniciado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluido_em" TIMESTAMP(3),
    "cancelado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos_lote" (
    "id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "etapa_origem_id" UUID,
    "etapa_destino_id" UUID,
    "quantidade" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "cor_id" UUID,
    "responsavel_id" UUID,
    "motivo" TEXT,
    "usuario_id" UUID,
    "usuario_nome" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentos_lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contadores" (
    "nome" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contadores_pkey" PRIMARY KEY ("nome")
);

-- CreateTable
CREATE TABLE "canais_venda" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "comissao_percentual" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "taxa_fixa" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "frete_subsidiado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "percentual_ads" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "percentual_imposto" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "percentual_antecipacao" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "margem_alvo_percentual" DECIMAL(6,3) NOT NULL DEFAULT 100,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canais_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custos_peca" (
    "id" UUID NOT NULL,
    "peca_id" UUID NOT NULL,
    "custo_argila" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "custo_esmalte" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "custo_queima" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "custo_embalagem" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minutos_mao_de_obra" INTEGER NOT NULL DEFAULT 0,
    "custo_hora_mao_de_obra" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "outros_custos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "perda_estimada_percentual" DECIMAL(6,3) NOT NULL DEFAULT 10,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custos_peca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precos_canal" (
    "id" UUID NOT NULL,
    "custo_peca_id" UUID NOT NULL,
    "canal_id" UUID NOT NULL,
    "preco_atual" DECIMAL(10,2),
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "precos_canal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faixas_taxa_canal" (
    "id" UUID NOT NULL,
    "canal_id" UUID NOT NULL,
    "valor_minimo" DECIMAL(10,2) NOT NULL,
    "valor_maximo" DECIMAL(10,2),
    "comissao_percentual" DECIMAL(6,3) NOT NULL,
    "taxa_fixa" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "frete_subsidiado" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "faixas_taxa_canal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "papeis_nome_key" ON "papeis"("nome");

-- CreateIndex
CREATE INDEX "logs_atividade_criado_em_idx" ON "logs_atividade"("criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nome_key" ON "categorias"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "cores_nome_key" ON "cores"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "responsaveis_nome_key" ON "responsaveis"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "responsaveis_usuario_id_key" ON "responsaveis"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "etapas_nome_key" ON "etapas"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "pecas_nome_key" ON "pecas"("nome");

-- CreateIndex
CREATE INDEX "pecas_categoria_id_idx" ON "pecas"("categoria_id");

-- CreateIndex
CREATE INDEX "roteiro_etapas_peca_id_idx" ON "roteiro_etapas"("peca_id");

-- CreateIndex
CREATE UNIQUE INDEX "roteiro_etapas_peca_id_ordem_key" ON "roteiro_etapas"("peca_id", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "peca_cores_peca_id_cor_id_key" ON "peca_cores"("peca_id", "cor_id");

-- CreateIndex
CREATE UNIQUE INDEX "materias_primas_nome_key" ON "materias_primas"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_codigo_key" ON "lotes"("codigo");

-- CreateIndex
CREATE INDEX "lotes_peca_id_idx" ON "lotes"("peca_id");

-- CreateIndex
CREATE INDEX "lotes_cor_id_idx" ON "lotes"("cor_id");

-- CreateIndex
CREATE INDEX "movimentos_lote_lote_id_idx" ON "movimentos_lote"("lote_id");

-- CreateIndex
CREATE INDEX "movimentos_lote_criado_em_idx" ON "movimentos_lote"("criado_em");

-- CreateIndex
CREATE INDEX "movimentos_lote_responsavel_id_criado_em_idx" ON "movimentos_lote"("responsavel_id", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "canais_venda_nome_key" ON "canais_venda"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "custos_peca_peca_id_key" ON "custos_peca"("peca_id");

-- CreateIndex
CREATE UNIQUE INDEX "precos_canal_custo_peca_id_canal_id_key" ON "precos_canal"("custo_peca_id", "canal_id");

-- CreateIndex
CREATE INDEX "faixas_taxa_canal_canal_id_idx" ON "faixas_taxa_canal"("canal_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_papel_id_fkey" FOREIGN KEY ("papel_id") REFERENCES "papeis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responsaveis" ADD CONSTRAINT "responsaveis_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapas" ADD CONSTRAINT "etapas_responsavel_padrao_id_fkey" FOREIGN KEY ("responsavel_padrao_id") REFERENCES "responsaveis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_responsavel_inicial_id_fkey" FOREIGN KEY ("responsavel_inicial_id") REFERENCES "responsaveis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roteiro_etapas" ADD CONSTRAINT "roteiro_etapas_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roteiro_etapas" ADD CONSTRAINT "roteiro_etapas_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "etapas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roteiro_etapas" ADD CONSTRAINT "roteiro_etapas_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "responsaveis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peca_cores" ADD CONSTRAINT "peca_cores_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peca_cores" ADD CONSTRAINT "peca_cores_cor_id_fkey" FOREIGN KEY ("cor_id") REFERENCES "cores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_cor_id_fkey" FOREIGN KEY ("cor_id") REFERENCES "cores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_lote_origem_id_fkey" FOREIGN KEY ("lote_origem_id") REFERENCES "lotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_lote" ADD CONSTRAINT "movimentos_lote_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_lote" ADD CONSTRAINT "movimentos_lote_etapa_origem_id_fkey" FOREIGN KEY ("etapa_origem_id") REFERENCES "etapas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_lote" ADD CONSTRAINT "movimentos_lote_etapa_destino_id_fkey" FOREIGN KEY ("etapa_destino_id") REFERENCES "etapas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_lote" ADD CONSTRAINT "movimentos_lote_cor_id_fkey" FOREIGN KEY ("cor_id") REFERENCES "cores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_lote" ADD CONSTRAINT "movimentos_lote_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "responsaveis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custos_peca" ADD CONSTRAINT "custos_peca_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precos_canal" ADD CONSTRAINT "precos_canal_custo_peca_id_fkey" FOREIGN KEY ("custo_peca_id") REFERENCES "custos_peca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precos_canal" ADD CONSTRAINT "precos_canal_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canais_venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faixas_taxa_canal" ADD CONSTRAINT "faixas_taxa_canal_canal_id_fkey" FOREIGN KEY ("canal_id") REFERENCES "canais_venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
