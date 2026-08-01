-- A capacidade do forno passa a morar na ETAPA de queima.
--
-- Antes ela vivia num Responsavel do tipo "forno" — um responsável de mentira,
-- que aparecia na lista junto com o oleiro e a equipe, nunca teve campo na tela
-- e emprestava o número para a etapa por tabela. A pergunta que a tela do Forno
-- faz é "cabe mais NESTA queima?", então é na etapa que a resposta tem de estar.
--
-- Aditiva e com carga: os números que já existem nos fornos são COPIADOS para
-- as etapas que os usam. Sem isto, a fila do forno sumiria no instante do
-- deploy (capacidade nula = 0 = "sem forno configurado"), e ninguém ligaria o
-- sumiço a uma migração.

ALTER TABLE "etapas" ADD COLUMN "capacidade_carga" INTEGER;
ALTER TABLE "etapas" ADD COLUMN "horas_por_queima" INTEGER;

UPDATE "etapas" e
SET "capacidade_carga" = r."capacidade_carga",
    "horas_por_queima" = r."horas_por_queima"
FROM "responsaveis" r
WHERE e."responsavel_padrao_id" = r.id
  AND r.tipo = 'forno';

-- o responsável do tipo forno deixa de ser o dono da etapa de queima: quem
-- executa uma carga é o forno, e o forno agora É a etapa
UPDATE "etapas" e
SET "responsavel_padrao_id" = NULL
FROM "responsaveis" r
WHERE e."responsavel_padrao_id" = r.id
  AND r.tipo = 'forno';

-- e some da lista de gente. O histórico que os cita continua intacto.
UPDATE "responsaveis" SET ativo = false WHERE tipo = 'forno';
