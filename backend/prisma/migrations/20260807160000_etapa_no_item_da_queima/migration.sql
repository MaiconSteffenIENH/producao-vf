-- De qual etapa de queima a carga saiu.
--
-- Sem isto, concluir a fornada precisava ADIVINHAR a etapa a partir do roteiro
-- da peça. Com uma parada de forno por tipo o chute acerta sempre; com duas
-- ("1ª Queima" e uma requeima de biscoito) ele pode tirar as peças da pilha
-- errada e mandá-las para o destino errado — um movimento que não aconteceu,
-- gravado no livro-razão.
--
-- NULO é caso legítimo: fornada aberta antes desta coluna existir não tem como
-- saber. A conclusão dessas cai no caminho antigo.
ALTER TABLE "queima_itens" ADD COLUMN "etapa_id" UUID;

ALTER TABLE "queima_itens"
  ADD CONSTRAINT "queima_itens_etapa_id_fkey"
  FOREIGN KEY ("etapa_id") REFERENCES "etapas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "queima_itens_etapa_id_idx" ON "queima_itens"("etapa_id");
