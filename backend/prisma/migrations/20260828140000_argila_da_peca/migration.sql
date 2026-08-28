-- DE QUE ARGILA A PEÇA É FEITA.
--
-- O pedido do João era simples: escolher o tipo de argila na tela da peça. A
-- primeira versão pediu isso por uma tabela de insumos com quantidade, unidade
-- e cor — correto para o sistema, técnico demais para quem cadastra.
--
-- Aqui a argila é UM CAMPO da peça. E a quantidade não é perguntada de novo:
-- `peso_cru_g` já diz quanto de barro cada peça leva, então o consumo de argila
-- é o próprio peso do cru. Pedir o mesmo número duas vezes é como as duas
-- respostas começam a divergir.
--
-- ON DELETE SET NULL, e não CASCADE: apagar uma matéria-prima do cadastro não
-- pode levar a peça junto. A peça continua existindo, apenas sem argila
-- definida — que é exatamente o que aconteceu no mundo real.
ALTER TABLE "pecas" ADD COLUMN "argila_id" UUID;

ALTER TABLE "pecas" ADD CONSTRAINT "pecas_argila_id_fkey"
  FOREIGN KEY ("argila_id") REFERENCES "materias_primas"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Buscar "as peças feitas desta argila" é a pergunta natural quando o estoque
-- de uma argila baixa, e sem índice ela varre a tabela inteira de peças.
CREATE INDEX "pecas_argila_id_idx" ON "pecas"("argila_id");
