import { prisma } from '../lib/prisma'
import type { Prisma } from '@prisma/client'

/**
 * Código legível para falar em voz alta no ateliê ("acabei o L-42", "a Q-7 já
 * esfriou").
 *
 * Contador travado por UPDATE em vez de sequence do Postgres: sequence pula
 * número em rollback, e buraco na numeração fica feio no papel colado na
 * parede — que é onde esses códigos acabam.
 *
 * Extraído de lote.service.ts quando a queima passou a precisar do mesmo
 * mecanismo com outro prefixo.
 */
export async function proximoCodigo(
  nome: string,
  prefixo: string,
  tx?: Prisma.TransactionClient,
): Promise<string> {
  const cliente = tx ?? prisma
  const atual = await cliente.contador.upsert({
    where: { nome },
    update: { valor: { increment: 1 } },
    create: { nome, valor: 1 },
  })
  return `${prefixo}-${String(atual.valor).padStart(4, '0')}`
}
