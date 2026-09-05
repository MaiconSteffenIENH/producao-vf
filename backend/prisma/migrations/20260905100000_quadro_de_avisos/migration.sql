-- O QUADRO DE AVISOS: o que foi combinado e não pode ser esquecido.
--
-- O João anotava no quadro branco e apagava depois. Uma bandeja de tortinha e
-- duas xícaras de coração verde ficaram para trás sem ninguém ter onde
-- consultar o combinado. A tabela existe para que esse combinado sobreviva.
--
-- Concluir não apaga a linha: o registro é o que o quadro branco não deixava.
-- Sem DEFAULT no id, como nas outras tabelas: `@default(uuid())` do Prisma
-- gera o valor na aplicação, e um default no banco divergiria do schema.
CREATE TABLE "avisos" (
  "id"            UUID         NOT NULL,
  "titulo"        TEXT         NOT NULL,
  "detalhe"       TEXT,
  -- DATE e não TIMESTAMP: o combinado é "até sexta", não "até sexta às 14h32".
  -- Guardar hora traria o fuso para dentro de uma comparação que é de dia, e a
  -- cor do menu passaria a depender do relógio de quem está olhando.
  "prazo"         DATE,
  "criado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- nome copiado no ato, não referência: o aviso continua legível depois de a
  -- pessoa sair do ateliê, que é quando consultar o histórico mais importa
  "criado_por"    TEXT,
  "concluido_em"  TIMESTAMP(3),
  "concluido_por" TEXT,

  CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);

-- Título vazio viraria card em branco no quadro, que é pior do que card
-- nenhum: ocupa espaço e não diz o que fazer.
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_titulo_preenchido_check"
  CHECK (length(btrim("titulo")) > 0);

-- Quem concluiu e quando andam juntos. Meia conclusão gravada deixaria o card
-- fora da lista de abertos sem ninguém saber quem o tirou de lá.
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_conclusao_completa_check"
  CHECK (
    ("concluido_em" IS NULL AND "concluido_por" IS NULL) OR
    ("concluido_em" IS NOT NULL AND "concluido_por" IS NOT NULL)
  );

-- A consulta que o menu faz a cada minuto é sempre a mesma: abertos, do prazo
-- mais curto para o mais longo. O índice composto atende ela inteira.
CREATE INDEX "avisos_concluido_em_prazo_idx" ON "avisos"("concluido_em", "prazo");
