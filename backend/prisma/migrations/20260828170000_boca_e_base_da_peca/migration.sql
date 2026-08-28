-- BOCA E BASE: as duas medidas que faltavam para a ordem de produção.
--
-- A ficha de papel do ateliê traz "ALTURA 10,50 / BOCA 9,50" — três medidas
-- circulares diferentes numa xícara: a mais larga do corpo, a abertura de cima
-- e o apoio de baixo. Com um campo só de diâmetro, o oleiro perde justamente a
-- que ele confere com o compasso enquanto torneia.
--
-- Nulo é o normal, e não uma pendência: pires não tem boca nem base, e um
-- traço na ficha é informação melhor do que um número inventado.
ALTER TABLE "pecas" ADD COLUMN "diametro_boca_cm" DECIMAL(6,1);
ALTER TABLE "pecas" ADD COLUMN "diametro_base_cm" DECIMAL(6,1);

-- Mesma trava das outras medidas: negativo ou zero é digitação errada, não
-- peça pequena. Fica junto do CHECK que já existia, porque um CHECK por coluna
-- multiplicaria o mesmo teste por seis.
ALTER TABLE "pecas" DROP CONSTRAINT "pecas_medidas_positivas_check";
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_medidas_positivas_check"
  CHECK (
    ("altura_cm"        IS NULL OR "altura_cm"        > 0) AND
    ("largura_cm"       IS NULL OR "largura_cm"       > 0) AND
    ("diametro_boca_cm" IS NULL OR "diametro_boca_cm" > 0) AND
    ("diametro_base_cm" IS NULL OR "diametro_base_cm" > 0) AND
    ("capacidade_ml"    IS NULL OR "capacidade_ml"    > 0) AND
    ("peso_cru_g"       IS NULL OR "peso_cru_g"       > 0) AND
    ("medida_tolerancia_pct" IS NULL OR ("medida_tolerancia_pct" >= 0 AND "medida_tolerancia_pct" <= 100))
  );
