-- Liga/desliga de módulo: uma linha por módulo desligado.
--
-- Escrita à mão: o container onde este trabalho foi feito não alcança
-- binaries.prisma.sh (403), então `prisma migrate dev` não roda ali. Em troca,
-- este arquivo foi aplicado num PostgreSQL de verdade e conferido campo a
-- campo contra o DMMF do schema.prisma (scripts/conferir-schema.mjs).
--
-- Nasce VAZIA, de propósito. Semear as 21 linhas com ativo = true seria
-- trabalho inútil e, pior, criaria a obrigação de semear de novo a cada módulo
-- novo — exatamente o que a forma "linha só existe para dizer que está
-- desligado" foi escolhida para evitar. Banco recém-migrado = tudo ligado.
--
-- A chave é o texto do registro em src/lib/modulos.ts, e não um uuid: é ela que
-- amarra a linha ao módulo, e um id gerado só acrescentaria uma indireção sem
-- dono. Por isso também não há FK para conferir — o registro mora no código.

CREATE TABLE "modulos_ativos" (
    "chave" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "modulos_ativos_pkey" PRIMARY KEY ("chave")
);
