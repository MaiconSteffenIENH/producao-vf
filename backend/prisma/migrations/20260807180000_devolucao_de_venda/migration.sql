-- Devolução de venda: o que o cliente mandou de volta.
--
-- Coluna própria em vez de desconto direto em `quantidade`, porque as duas
-- perguntas são diferentes: "quanto saiu" responde pelo giro do anúncio,
-- "quanto ficou" responde pela demanda real. Baixar `quantidade` apagaria a
-- primeira, e com ela a taxa de devolução por canal.
--
-- Default zero e NOT NULL: toda venda já lançada não teve devolução registrada,
-- e nulo aqui obrigaria toda conta de líquido a tratar o caso "não sei".
ALTER TABLE "vendas" ADD COLUMN "devolvidas" INTEGER NOT NULL DEFAULT 0;
