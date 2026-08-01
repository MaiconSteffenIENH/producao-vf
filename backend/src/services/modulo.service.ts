/*
 * O QUE O ATELIÊ LIGOU — o estado de cada módulo do sistema.
 *
 * O registro de módulos mora no código (lib/modulos.ts); o que mora no banco é
 * só a EXCEÇÃO: uma linha para cada módulo que alguém desligou. Nada mais.
 *
 * Essa escolha é o coração do pedido "precisa listar todos e sempre que
 * adicionarmos". Guardar a lista do que está LIGADO obrigaria a acrescentar o
 * módulo novo à lista no dia em que ele nasce — e o dia em que alguém esquecer,
 * o recurso recém-lançado fica invisível para todo mundo sem nenhum erro na
 * tela, o pior tipo de falha que existe. Guardando o desligamento, o padrão de
 * um módulo que ninguém configurou é estar ligado, que é o que se espera.
 *
 * Desligar não apaga dado e não desliga cálculo: o Planejamento continua
 * inflando pela perda mesmo com a tela fora do ar. Só o caminho até ela some.
 */
import { prisma } from '../lib/prisma'
import { invalido, naoEncontrado, regraDeNegocio } from '../lib/erros'
import { MODULOS, moduloPorChave, type Modulo } from '../lib/modulos'

export type EstadoDoModulo = Modulo & { ativo: boolean }

/**
 * As chaves desligadas — a entrada de `modulosVisiveis` e do guarda das rotas.
 *
 * Sem cache de propósito. A tabela tem no máximo uma linha por módulo e a
 * consulta sai junto com as outras da requisição, mas o que decide é outra
 * coisa: guardar isto em memória faria o "religar" do dono demorar a aparecer
 * no menu de quem já estava com o app aberto — e "sumiu e não volta" é o
 * relato de bug que ninguém consegue reproduzir.
 */
export async function chavesDesligadas(): Promise<string[]> {
  const linhas = await prisma.moduloAtivo.findMany({ where: { ativo: false }, select: { chave: true } })
  return linhas.map((l: { chave: string }) => l.chave)
}

/** Todos os módulos que existem, cada um com o estado que o ateliê deu a ele. */
export async function listarModulos(): Promise<EstadoDoModulo[]> {
  const desligados = new Set(await chavesDesligadas())
  return MODULOS.map((m) => ({ ...m, ativo: !desligados.has(m.chave) }))
}

/**
 * Liga ou desliga um módulo.
 *
 * Grava linha nos dois casos, inclusive ao religar. Apagar a linha no "ligar"
 * daria o mesmo resultado hoje, mas deixa de valer no dia em que este registro
 * ganhar quem mexeu e quando — e um upsert que às vezes apaga é a espécie de
 * detalhe que ninguém lembra ao acrescentar a coluna.
 */
export async function definirAtivo(chave: string, corpo: unknown): Promise<EstadoDoModulo> {
  const modulo = moduloPorChave(chave)
  if (!modulo) throw naoEncontrado('Módulo')

  const ativo = (corpo as { ativo?: unknown } | null | undefined)?.ativo
  if (typeof ativo !== 'boolean') throw invalido('Diga se o módulo fica ligado ou desligado.')

  if (!ativo && modulo.essencial) {
    throw regraDeNegocio(
      `${modulo.rotulo} não pode ser desligado. ${modulo.oQuePerde} ` +
        'Desligar trancaria todo mundo do lado de fora — inclusive de Ajustes, que é onde se religa.',
    )
  }

  await prisma.moduloAtivo.upsert({ where: { chave }, update: { ativo }, create: { chave, ativo } })
  return { ...modulo, ativo }
}
