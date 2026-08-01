import { MODULOS_POR_ROTA, moduloPorChave, podeVerModulo } from './modulos'

/*
 * A DECISÃO DO GUARDA, sem Express e sem Prisma.
 *
 * Ela morava dentro do middleware, e por isso não tinha teste: exercitá-la
 * exigia um servidor de pé e um banco. Mas é exatamente o tipo de regra que
 * NÃO pode ser conferida só olhando — o modo de falha caro aqui é o falso
 * bloqueio, que não avisa: a tela simplesmente "para de funcionar" e ninguém
 * liga o defeito à caixinha que alguém desmarcou três dias antes.
 *
 * As duas proteções contra trancar o ateliê inteiro moram aqui:
 *
 *   1. Prefixo fora do mapa PASSA. Fosse ao contrário, toda rota nova nasceria
 *      bloqueada até alguém lembrar de mapeá-la.
 *   2. As portas de sempre — entrar, saber quem se é, responder ao monitor e
 *      trocar a senha provisória — passam antes de qualquer conta. Sem elas um
 *      engano de configuração não teria conserto pela própria tela.
 */

export const SEMPRE_LIBERADOS = new Set(['auth', 'me', 'health', 'ajustes'])

export type Veredito =
  | { passa: true }
  | { passa: false; motivo: 'desligado' | 'sem_acesso'; mensagem: string }

export function avaliarAcesso(
  caminho: string,
  desligados: readonly string[],
  permissoesDoPapel: unknown,
  admin: boolean,
  metodo = 'GET',
): Veredito {
  // minúsculas porque o Express casa rota sem diferenciar caixa: sem isto,
  // /LOTES entraria por uma porta que /lotes tem fechada
  const prefixo = caminho.split('/').filter(Boolean)[0]?.toLowerCase()
  if (!prefixo || SEMPRE_LIBERADOS.has(prefixo)) return { passa: true }

  const chaves = MODULOS_POR_ROTA[prefixo]
  if (!chaves) return { passa: true }

  /*
   * LER e ESCREVER não são a mesma pergunta.
   *
   * Para LER, basta UM dos módulos da rota estar liberado: `/cores` alimenta a
   * tela de Esmaltes, mas também o chip do lote no quadro, os esmaltes
   * possíveis da peça e a fila de fotos. Exigir todos barraria o quadro — que
   * é essencial e nem pode ser desligado — só porque alguém escondeu o
   * cadastro de cores.
   *
   * Para ESCREVER, vale só o DONO da rota, que é o primeiro da lista: a tela
   * de cadastro. Sem esta separação, quem foi restrito a "Tarefas do dia"
   * continuaria podendo APAGAR um esmalte por baixo, porque o quadro (que ele
   * tem) também lê /cores. Ler o que a tela dele mostra é legítimo; mudar o
   * cadastro de outra tela não é.
   */
  const exigidos = metodo === 'GET' || metodo === 'HEAD' ? chaves : chaves.slice(0, 1)
  if (exigidos.some((c) => podeVerModulo(c, desligados, permissoesDoPapel, admin))) {
    return { passa: true }
  }

  // separa "o ateliê desligou" de "seu acesso não inclui": são conversas
  // diferentes, e mandar a pessoa falar com o admin quando o problema é uma
  // chave desligada faz ela procurar o erro no lugar errado
  const soFaltouOAtelie = exigidos.filter((c) => podeVerModulo(c, [], permissoesDoPapel, admin))
  if (soFaltouOAtelie.length > 0) {
    return {
      passa: false,
      motivo: 'desligado',
      mensagem:
        `Esta tela depende de ${enumerar(soFaltouOAtelie)}, que o ateliê desligou. ` +
        'Religar em Ajustes devolve tudo como estava — nada foi apagado.',
    }
  }
  return {
    passa: false,
    motivo: 'sem_acesso',
    mensagem: `Seu acesso não inclui ${enumerar(exigidos)}. Peça a quem administra para liberar o módulo em Ajustes.`,
  }
}

/** "Histórico", "Histórico ou Peças prontas", "A, B ou C". */
export function enumerar(chaves: readonly string[]): string {
  const rotulos = chaves.map((c) => moduloPorChave(c)?.rotulo ?? c)
  if (rotulos.length <= 1) return rotulos[0] ?? 'este módulo'
  return `${rotulos.slice(0, -1).join(', ')} ou ${rotulos[rotulos.length - 1]}`
}
