import { prisma } from '../lib/prisma'
import { naoEncontrado } from '../lib/erros'
import type { Sessao } from '../lib/token'
import {
  diaDeCalendario,
  diasUteisDaSemana,
  lerAviso,
  ordenarAvisos,
  posicaoNoQuadro,
  resumirQuadro,
  segundaDaSemana,
  type LeituraDoAviso,
  type PosicaoNoQuadro,
} from '../lib/avisos'
import { diaDoAtelie } from '../lib/agenda-calculo'

/*
 * O QUADRO DE AVISOS.
 *
 * O que o João combinava no quadro branco e apagava depois. Uma bandeja de
 * tortinha e duas xícaras de coração verde ficaram para trás porque não havia
 * estoque até a data prometida, e o combinado não existia em lugar nenhum para
 * ser consultado.
 *
 * TODA a decisão de urgência mora em lib/avisos.ts, sem Prisma: aqui só se lê
 * do banco e se anexa a leitura. Isso é o que permite testar a virada do dia,
 * o fuso e a ordem sem subir banco nenhum.
 */

/** o que o Prisma devolve; explícito porque o client não é gerado neste ambiente */
type AvisoCru = {
  id: string
  titulo: string
  detalhe: string | null
  prazo: Date | null
  criadoEm: Date
  criadoPor: string | null
  concluidoEm: Date | null
  concluidoPor: string | null
}

export type AvisoNaTela = AvisoCru &
  LeituraDoAviso & {
    /** onde o card aparece no quadro da semana; nulo quando é de outra semana */
    posicao: PosicaoNoQuadro | null
  }

function comLeitura(aviso: AvisoCru, agora: Date, segunda?: string): AvisoNaTela {
  return {
    ...aviso,
    ...lerAviso(aviso, agora),
    posicao: segunda ? posicaoNoQuadro(aviso, segunda, agora) : null,
  }
}

/**
 * O quadro inteiro: abertos em cima, concluídos numa lista à parte.
 *
 * Os concluídos vêm LIMITADOS. Concluir não apaga, de propósito — poder
 * consultar o que foi combinado é o que o quadro branco não permitia. Mas
 * devolver dois anos de histórico a cada abertura da tela transformaria a
 * consulta num download, e a tela é aberta no celular em 4G.
 */
export async function listarAvisos(
  opcoes: { concluidos?: number; semana?: string } = {},
  agora = new Date(),
) {
  const limite = Math.min(Math.max(opcoes.concluidos ?? 30, 0), 200)
  /*
   * A semana pedida é normalizada para a segunda-feira dela.
   *
   * A tela manda uma data qualquer ao navegar, e aceitar isso sem normalizar
   * faria o quadro de quarta ter colunas diferentes do quadro de quinta da
   * mesma semana. Sem parâmetro, é a semana de hoje no fuso do ateliê.
   */
  const segunda = segundaDaSemana(opcoes.semana ?? diaDoAtelie(agora))

  const [abertosCrus, concluidosCrus] = await Promise.all([
    prisma.aviso.findMany({ where: { concluidoEm: null } }),
    prisma.aviso.findMany({
      where: { concluidoEm: { not: null } },
      orderBy: { concluidoEm: 'desc' },
      take: limite,
    }),
  ])

  const abertos = ordenarAvisos(abertosCrus as AvisoCru[], agora)
  return {
    semana: { segunda, dias: diasUteisDaSemana(segunda), hoje: diaDoAtelie(agora) },
    abertos: abertos.map((a) => comLeitura(a, agora, segunda)),
    concluidos: (concluidosCrus as AvisoCru[]).map((a) => comLeitura(a, agora)),
    resumo: resumirQuadro(abertosCrus as AvisoCru[], agora),
  }
}

/**
 * Só o resumo, para o menu lateral.
 *
 * Existe separado da listagem porque o menu pergunta de minuto em minuto, em
 * toda tela do sistema, e não precisa dos textos: puxar o quadro inteiro para
 * decidir uma cor gastaria banda de graça no 4G do ateliê.
 */
export async function resumoDoQuadro(agora = new Date()) {
  const abertos = await prisma.aviso.findMany({
    where: { concluidoEm: null },
    select: { prazo: true, concluidoEm: true },
  })
  return resumirQuadro(abertos as { prazo: Date | null; concluidoEm: Date | null }[], agora)
}

export async function criarAviso(
  dados: { titulo: string; detalhe?: string | null; prazo?: string | null },
  sessao?: Sessao,
) {
  const criado = await prisma.aviso.create({
    data: {
      titulo: dados.titulo,
      detalhe: vazioVirouNulo(dados.detalhe),
      prazo: emData(dados.prazo),
      criadoPor: sessao?.nome ?? null,
    },
  })
  return comLeitura(criado as AvisoCru, new Date())
}

export async function atualizarAviso(
  id: string,
  dados: { titulo?: string; detalhe?: string | null; prazo?: string | null },
) {
  const existente = await prisma.aviso.findUnique({ where: { id } })
  if (!existente) throw naoEncontrado('Aviso')

  const atualizado = await prisma.aviso.update({
    where: { id },
    data: {
      // campo ausente é "não mexa": a tela pode ser uma versão antiga em cache
      // do PWA que ainda não conhece o campo que acabou de nascer
      ...(dados.titulo !== undefined ? { titulo: dados.titulo } : {}),
      ...(dados.detalhe !== undefined ? { detalhe: vazioVirouNulo(dados.detalhe) } : {}),
      ...(dados.prazo !== undefined ? { prazo: emData(dados.prazo) } : {}),
    },
  })
  return comLeitura(atualizado as AvisoCru, new Date())
}

/**
 * Marca como feito, guardando quem fez.
 *
 * Concluir de novo não é erro: duas pessoas podem tocar no mesmo card, e a
 * segunda receberia um 404 sem entender por quê. A primeira conclusão é a que
 * fica — trocar o nome depois apagaria quem realmente fez.
 */
export async function concluirAviso(id: string, sessao?: Sessao) {
  const existente = (await prisma.aviso.findUnique({ where: { id } })) as AvisoCru | null
  if (!existente) throw naoEncontrado('Aviso')
  if (existente.concluidoEm) return comLeitura(existente, new Date())

  const feito = await prisma.aviso.update({
    where: { id },
    data: { concluidoEm: new Date(), concluidoPor: sessao?.nome ?? 'alguém do ateliê' },
  })
  return comLeitura(feito as AvisoCru, new Date())
}

/** Desfaz a conclusão. Card fechado por engano voltaria a ser post-it sem isso. */
export async function reabrirAviso(id: string) {
  const existente = await prisma.aviso.findUnique({ where: { id } })
  if (!existente) throw naoEncontrado('Aviso')
  const reaberto = await prisma.aviso.update({
    where: { id },
    // os dois juntos, sempre: o CHECK do banco recusa meia conclusão
    data: { concluidoEm: null, concluidoPor: null },
  })
  return comLeitura(reaberto as AvisoCru, new Date())
}

export async function apagarAviso(id: string) {
  await prisma.aviso.delete({ where: { id } })
}

const vazioVirouNulo = (t?: string | null) => (t === undefined || t === null || t === '' ? null : t)

/**
 * Texto AAAA-MM-DD vira a data-calendário correspondente, em UTC.
 *
 * `new Date('2026-09-05')` já devolve meia-noite UTC, que é exatamente o que a
 * coluna DATE guarda. O cuidado é não deixar passar por um construtor com hora,
 * porque aí o fuso do servidor entraria numa data que não tem hora nenhuma.
 */
const emData = (iso?: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null)
