-- Motivo da perda: de texto livre para lista fixa, sem perder o texto.
--
-- Escrita à mão: o container onde este trabalho foi feito não alcança
-- binaries.prisma.sh (403), então `prisma migrate dev` não roda ali. Em troca,
-- este arquivo foi aplicado num PostgreSQL de verdade e conferido campo a
-- campo contra o DMMF do schema.prisma (scripts/conferir-schema.mjs).
--
-- Puramente aditiva. A coluna nasce NULA e continua nula em todo movimento de
-- perda que já existe — o histórico anterior nunca teve esse dado, e preencher
-- com um chute ("outro") transformaria ausência de diagnóstico em diagnóstico
-- errado, que é justamente o que a perda medida não pode ter: ela alimenta o
-- quanto o planejamento manda produzir e o custo real na precificação.

ALTER TABLE "movimentos_lote" ADD COLUMN "motivo_tipo" TEXT;

-- O histórico filtra por "perda com este motivo", e o livro-razão é a tabela
-- que mais cresce no sistema: sem índice, a busca varre também avanços e
-- divisões, que são a maior parte das linhas e nunca têm motivo tipado.
CREATE INDEX "movimentos_lote_tipo_motivo_tipo_idx" ON "movimentos_lote"("tipo", "motivo_tipo");
