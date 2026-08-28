-- FICHA TÉCNICA DA PEÇA: de que argila é feita e que tamanho deveria ter.
--
-- Pedido do João em 27/08/2026. Hoje o sistema sabe o roteiro da peça, mas não
-- sabe o padrão dela — então cada pessoa reproduz de memória, e a diferença só
-- aparece quando as peças estão lado a lado na prateleira.
--
-- TUDO NULO POR PADRÃO, de propósito. São 30 e poucas peças já cadastradas, e
-- nenhuma tem medida registrada. Coluna NOT NULL com default zero diria "esta
-- peça tem 0 cm de altura", que é diferente de "ninguém mediu ainda" — e a tela
-- precisa dessa diferença para dizer "sem padrão definido" em vez de mostrar
-- zero e ninguém entender.
--
-- A tolerância também nasce nula, e não com 5%. Tolerância é decisão do ateliê
-- por peça: um bowl aceita mais variação que uma tampa que precisa encaixar.
-- Escolher um número aqui seria inventar regra de produção pelo banco.
ALTER TABLE "pecas" ADD COLUMN "altura_cm" DECIMAL(6,1);
ALTER TABLE "pecas" ADD COLUMN "largura_cm" DECIMAL(6,1);
ALTER TABLE "pecas" ADD COLUMN "capacidade_ml" INTEGER;
ALTER TABLE "pecas" ADD COLUMN "peso_cru_g" INTEGER;
ALTER TABLE "pecas" ADD COLUMN "medidas_momento" TEXT;
ALTER TABLE "pecas" ADD COLUMN "medida_tolerancia_pct" DECIMAL(4,1);

-- O momento da medição só aceita os dois valores que existem no processo.
--
-- A trava é no banco, e não só no zod, porque este campo decide como a medida é
-- LIDA: 8 cm no cru e 8 cm no pronto são peças de tamanhos diferentes, já que a
-- argila encolhe na queima. Um valor fora da lista, vindo de importação ou de
-- um cliente antigo, faria a ficha comparar coisas incomparáveis em silêncio.
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_medidas_momento_check"
  CHECK ("medidas_momento" IS NULL OR "medidas_momento" IN ('cru', 'pronto'));

-- Medida negativa não é peça pequena, é erro de digitação. A tolerância tem
-- teto de 100% porque acima disso a faixa aceitável incluiria o zero, o que
-- equivale a não ter padrão nenhum.
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_medidas_positivas_check"
  CHECK (
    ("altura_cm"    IS NULL OR "altura_cm"    > 0) AND
    ("largura_cm"   IS NULL OR "largura_cm"   > 0) AND
    ("capacidade_ml" IS NULL OR "capacidade_ml" > 0) AND
    ("peso_cru_g"   IS NULL OR "peso_cru_g"   > 0) AND
    ("medida_tolerancia_pct" IS NULL OR ("medida_tolerancia_pct" >= 0 AND "medida_tolerancia_pct" <= 100))
  );
