-- Referência do modelo de dados da Fase 1, escrita à mão para conferência.
--
-- NÃO é a migração oficial. A migração canônica sai de
--   npx prisma migrate dev --name inicial
-- na máquina de quem for subir o projeto, e é ela que o Render aplica
-- (npx prisma migrate deploy no start). Este arquivo existe para ler o
-- modelo sem abrir o schema.prisma e para validar o desenho contra um
-- Postgres de verdade.

CREATE TABLE papeis (
  id         UUID PRIMARY KEY,
  nome       TEXT NOT NULL UNIQUE,
  admin      BOOLEAN NOT NULL DEFAULT FALSE,
  protegido  BOOLEAN NOT NULL DEFAULT FALSE,
  permissoes JSONB NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usuarios (
  id                   UUID PRIMARY KEY,
  nome                 TEXT NOT NULL,
  email                TEXT NOT NULL UNIQUE,
  senha_hash           TEXT NOT NULL,
  papel_id             UUID REFERENCES papeis (id),
  ativo                BOOLEAN NOT NULL DEFAULT TRUE,
  precisa_trocar_senha BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE logs_atividade (
  id           UUID PRIMARY KEY,
  usuario_id   UUID,
  usuario_nome TEXT NOT NULL,
  metodo       TEXT NOT NULL,
  recurso      TEXT NOT NULL,
  caminho      TEXT NOT NULL,
  entidade_id  TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX logs_atividade_criado_em_idx ON logs_atividade (criado_em);

CREATE TABLE categorias (
  id        UUID PRIMARY KEY,
  nome      TEXT NOT NULL UNIQUE,
  ordem     INTEGER NOT NULL DEFAULT 0,
  ativo     BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Esmalte. hex é só o chip da interface: Branco e Pedra Sabão têm
-- praticamente a mesma cor média, então amostra_url é o que diferencia.
CREATE TABLE cores (
  id          UUID PRIMARY KEY,
  nome        TEXT NOT NULL UNIQUE,
  nome_busca  TEXT NOT NULL DEFAULT '',
  hex         TEXT NOT NULL DEFAULT '#CCCCCC',
  amostra_url TEXT,
  malhado     BOOLEAN NOT NULL DEFAULT FALSE,
  observacao  TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE responsaveis (
  id                UUID PRIMARY KEY,
  nome              TEXT NOT NULL UNIQUE,
  nome_busca        TEXT NOT NULL DEFAULT '',
  tipo              TEXT NOT NULL DEFAULT 'pessoa',
  cor               TEXT NOT NULL DEFAULT '#BBA58C',
  capacidade_diaria INTEGER,
  usuario_id        UUID UNIQUE REFERENCES usuarios (id),
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE etapas (
  id                    UUID PRIMARY KEY,
  nome                  TEXT NOT NULL UNIQUE,
  tipo                  TEXT NOT NULL DEFAULT 'producao',
  ordem_padrao          INTEGER NOT NULL DEFAULT 0,
  define_cor            BOOLEAN NOT NULL DEFAULT FALSE,
  estoque_intermediario BOOLEAN NOT NULL DEFAULT FALSE,
  responsavel_padrao_id UUID REFERENCES responsaveis (id),
  ativo                 BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pecas (
  id                     UUID PRIMARY KEY,
  nome                   TEXT NOT NULL UNIQUE,
  nome_busca             TEXT NOT NULL DEFAULT '',
  categoria_id           UUID NOT NULL REFERENCES categorias (id),
  responsavel_inicial_id UUID REFERENCES responsaveis (id),
  tempo_medio_dias       INTEGER NOT NULL DEFAULT 30,
  qtd_minima_desejada    INTEGER NOT NULL DEFAULT 0,
  qtd_minima_biscoito    INTEGER NOT NULL DEFAULT 0,
  preco_base             DECIMAL(10, 2),
  observacao             TEXT,
  ativo                  BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pecas_categoria_id_idx ON pecas (categoria_id);

CREATE TABLE roteiro_etapas (
  id             UUID PRIMARY KEY,
  peca_id        UUID NOT NULL REFERENCES pecas (id) ON DELETE CASCADE,
  etapa_id       UUID NOT NULL REFERENCES etapas (id),
  ordem          INTEGER NOT NULL,
  responsavel_id UUID REFERENCES responsaveis (id),
  dias_estimados INTEGER NOT NULL DEFAULT 1,
  UNIQUE (peca_id, ordem)
);
CREATE INDEX roteiro_etapas_peca_id_idx ON roteiro_etapas (peca_id);

CREATE TABLE peca_cores (
  id                  UUID PRIMARY KEY,
  peca_id             UUID NOT NULL REFERENCES pecas (id) ON DELETE CASCADE,
  cor_id              UUID NOT NULL REFERENCES cores (id),
  qtd_minima_desejada INTEGER NOT NULL DEFAULT 0,
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (peca_id, cor_id)
);

CREATE TABLE materias_primas (
  id             UUID PRIMARY KEY,
  nome           TEXT NOT NULL UNIQUE,
  nome_busca     TEXT NOT NULL DEFAULT '',
  tipo           TEXT NOT NULL DEFAULT 'esmalte',
  unidade        TEXT NOT NULL DEFAULT 'kg',
  estoque_atual  DECIMAL(10, 3) NOT NULL DEFAULT 0,
  estoque_minimo DECIMAL(10, 3) NOT NULL DEFAULT 0,
  fornecedor     TEXT,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════ Fase 3 — Produção ═══════════════════

CREATE TABLE contadores (
  nome  TEXT PRIMARY KEY,
  valor INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE lotes (
  id                 UUID PRIMARY KEY,
  codigo             TEXT NOT NULL UNIQUE,
  peca_id            UUID NOT NULL REFERENCES pecas (id),
  cor_id             UUID REFERENCES cores (id),
  quantidade_inicial INTEGER NOT NULL,
  origem             TEXT NOT NULL DEFAULT 'manual',
  lote_origem_id     UUID REFERENCES lotes (id),
  observacao         TEXT,
  iniciado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em       TIMESTAMPTZ,
  cancelado_em       TIMESTAMPTZ,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lotes_peca_id_idx ON lotes (peca_id);
CREATE INDEX lotes_cor_id_idx  ON lotes (cor_id);

-- Livro-razão: etapa_origem nula = entrada no sistema;
-- etapa_destino nula = saída definitiva (perda ou divisão).
CREATE TABLE movimentos_lote (
  id               UUID PRIMARY KEY,
  lote_id          UUID NOT NULL REFERENCES lotes (id) ON DELETE CASCADE,
  etapa_origem_id  UUID REFERENCES etapas (id),
  etapa_destino_id UUID REFERENCES etapas (id),
  quantidade       INTEGER NOT NULL,
  tipo             TEXT NOT NULL,
  cor_id           UUID REFERENCES cores (id),
  responsavel_id   UUID REFERENCES responsaveis (id),
  motivo           TEXT,
  usuario_id       UUID,
  usuario_nome     TEXT NOT NULL,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX movimentos_lote_lote_id_idx   ON movimentos_lote (lote_id);
CREATE INDEX movimentos_lote_criado_em_idx ON movimentos_lote (criado_em);
CREATE INDEX movimentos_lote_resp_data_idx ON movimentos_lote (responsavel_id, criado_em);

-- ═══════════════════ Fase 4 — Precificação ═══════════════════

CREATE TABLE canais_venda (
  id                     UUID PRIMARY KEY,
  nome                   TEXT NOT NULL UNIQUE,
  comissao_percentual    DECIMAL(6,3) NOT NULL DEFAULT 0,
  taxa_fixa              DECIMAL(10,2) NOT NULL DEFAULT 0,
  frete_subsidiado       DECIMAL(10,2) NOT NULL DEFAULT 0,
  percentual_ads         DECIMAL(6,3) NOT NULL DEFAULT 0,
  percentual_imposto     DECIMAL(6,3) NOT NULL DEFAULT 0,
  percentual_antecipacao DECIMAL(6,3) NOT NULL DEFAULT 0,
  margem_alvo_percentual DECIMAL(6,3) NOT NULL DEFAULT 100,
  moeda                  TEXT NOT NULL DEFAULT 'BRL',
  observacao             TEXT,
  ativo                  BOOLEAN NOT NULL DEFAULT TRUE,
  ordem                  INTEGER NOT NULL DEFAULT 0,
  criado_em              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE faixas_taxa_canal (
  id                  UUID PRIMARY KEY,
  canal_id            UUID NOT NULL REFERENCES canais_venda (id) ON DELETE CASCADE,
  valor_minimo        DECIMAL(10,2) NOT NULL,
  valor_maximo        DECIMAL(10,2),
  comissao_percentual DECIMAL(6,3) NOT NULL,
  taxa_fixa           DECIMAL(10,2) NOT NULL DEFAULT 0,
  frete_subsidiado    DECIMAL(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX faixas_taxa_canal_canal_id_idx ON faixas_taxa_canal (canal_id);

CREATE TABLE custos_peca (
  id                        UUID PRIMARY KEY,
  peca_id                   UUID NOT NULL UNIQUE REFERENCES pecas (id) ON DELETE CASCADE,
  custo_argila              DECIMAL(10,2) NOT NULL DEFAULT 0,
  custo_esmalte             DECIMAL(10,2) NOT NULL DEFAULT 0,
  custo_queima              DECIMAL(10,2) NOT NULL DEFAULT 0,
  custo_embalagem           DECIMAL(10,2) NOT NULL DEFAULT 0,
  minutos_mao_de_obra       INTEGER NOT NULL DEFAULT 0,
  custo_hora_mao_de_obra    DECIMAL(10,2) NOT NULL DEFAULT 0,
  outros_custos             DECIMAL(10,2) NOT NULL DEFAULT 0,
  perda_estimada_percentual DECIMAL(6,3) NOT NULL DEFAULT 10,
  atualizado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE precos_canal (
  id            UUID PRIMARY KEY,
  custo_peca_id UUID NOT NULL REFERENCES custos_peca (id) ON DELETE CASCADE,
  canal_id      UUID NOT NULL REFERENCES canais_venda (id) ON DELETE CASCADE,
  preco_atual   DECIMAL(10,2),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (custo_peca_id, canal_id)
);
