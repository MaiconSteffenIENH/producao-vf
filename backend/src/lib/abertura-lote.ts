import { diaDoAtelie, FUSO_ATELIE_MS } from './agenda-calculo'

/*
 * A DATA EM QUE O LOTE COMEÇOU, E A QUANTIDADE COM QUE ELE ABRIU.
 *
 * O sistema sempre carimbou o instante do clique e nunca deixou corrigir nada.
 * No ateliê isso quase nunca é verdade: o oleiro torneia na segunda e o lote só
 * é lançado na quarta; alguém digita 28 onde eram 30 e a única saída era apagar
 * o lote e abrir outro — perdendo o código, o histórico e a espera acumulada.
 *
 * ── TUDO NO FUSO DO ATELIÊ, E NÃO EM UTC ──
 *
 * "Que dia é este carimbo?" já tinha resposta neste projeto: `diaDoAtelie`, em
 * agenda-calculo.ts, que desconta as 3 horas de Novo Hamburgo. A primeira
 * versão disto reinventou a pergunta em UTC, e as duas discordavam nas pontas
 * do dia: um lote aberto às 23h de Brasília é 02h UTC do dia SEGUINTE, então a
 * tela mostrava 2 de agosto e o campo de edição vinha com 3. Quem abrisse para
 * arrumar uma vírgula na observação empurrava a data um dia inteiro, e o
 * carimbo do livro-razão junto.
 *
 * Agora existe uma definição só de "dia", e é a do ateliê.
 *
 * ── POR QUE MEIO-DIA ──
 *
 * O campo da tela manda "AAAA-MM-DD", sem hora. Meia-noite do ateliê fica a um
 * segundo de escorregar para o dia anterior em qualquer conta que arredonde;
 * meio-dia tem doze horas de folga dos dois lados.
 *
 * ── POR QUE HOJE É EXCEÇÃO ──
 *
 * Se o lote é de hoje, o carimbo é o instante de agora. Às 8h da manhã,
 * meio-dia ainda não chegou: o lote nasceria no futuro, com espera negativa, no
 * caso mais comum de todos.
 */

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * Quanto para trás uma data de abertura pode ir.
 *
 * Um ano não é rigor: é o ponto em que a data deixa de ser lembrança e vira
 * erro de digitação — quase sempre o ano trocado.
 */
export const DIAS_MAXIMOS_PARA_TRAS = 365

export type Avaliacao = { ok: true; instante: Date } | { ok: false; erro: string }

/** O dia "AAAA-MM-DD" de um instante, no fuso do ateliê. Fonte única. */
export const diaDaAbertura = diaDoAtelie

/** Meio-dia do ateliê, em UTC, para um dia "AAAA-MM-DD". */
function meioDiaDoAtelie(ano: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0, 0) + FUSO_ATELIE_MS)
}

/**
 * Transforma "AAAA-MM-DD" no instante que vai para o banco, ou explica por quê não dá.
 *
 * `agora` entra como parâmetro para o teste poder fixar o relógio — e porque um
 * módulo que lê a hora sozinho não se testa.
 */
export function instanteDaAbertura(texto: string, agora: Date): Avaliacao {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return { ok: false, erro: 'A data de abertura precisa vir como AAAA-MM-DD.' }
  }

  const [ano, mes, dia] = texto.split('-').map(Number)
  const meioDia = meioDiaDoAtelie(ano, mes, dia)

  /*
   * Pega 31 de fevereiro e afins. O `Date` conserta sozinho para 3 de março, e
   * guardar isso salvaria uma data que a pessoa não escolheu. A volta pelo
   * `diaDaAbertura` confere no mesmo fuso em que a data foi lida.
   */
  if (diaDaAbertura(meioDia) !== texto) {
    return { ok: false, erro: `${texto} não é uma data que existe.` }
  }

  const hoje = diaDaAbertura(agora)
  if (texto > hoje) return { ok: false, erro: 'O lote não pode ter começado no futuro.' }
  if (texto === hoje) {
    // hoje: o instante de agora, para o lote nunca nascer no futuro
    return { ok: true, instante: new Date(agora.getTime()) }
  }

  const diasParaTras = Math.round(
    (Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${texto}T00:00:00Z`)) / DIA_MS,
  )
  if (diasParaTras > DIAS_MAXIMOS_PARA_TRAS) {
    return {
      ok: false,
      erro: `${texto} está a mais de um ano atrás — confira o ano.`,
    }
  }

  return { ok: true, instante: meioDia }
}

/**
 * A mesma conta, para CORRIGIR a data de um lote que já anda.
 *
 * Aqui existe um teto a mais: o lote não pode ter começado depois de já ter se
 * mexido. Deixar passar produziria um lote que avançou de etapa antes de
 * existir.
 *
 * `diaAtual` é o que impede o efeito colateral silencioso: quem abre o lote só
 * para arrumar a observação reenvia a data como ela já está, e sem esta saída
 * antecipada o carimbo do livro-razão seria reescrito — perdendo a hora, e às
 * vezes o dia — a cada salvamento. Mais: como "hoje" vira o instante de AGORA,
 * que é sempre posterior a qualquer movimento, todo lote aberto e movimentado
 * no mesmo dia ficava impossível de editar.
 */
export function corrigirAbertura(
  texto: string,
  agora: Date,
  diaAtual: string,
  proximoMovimentoEm: Date | null,
): Avaliacao | { ok: true; instante: null } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return { ok: false, erro: 'A data de abertura precisa vir como AAAA-MM-DD.' }
  }
  // o dia não mudou: não se toca em carimbo nenhum
  if (texto === diaAtual) return { ok: true, instante: null }

  const base = instanteDaAbertura(texto, agora)
  if (!base.ok) return base

  if (proximoMovimentoEm && base.instante.getTime() > proximoMovimentoEm.getTime()) {
    return {
      ok: false,
      erro:
        'Este lote já se mexeu antes dessa data. A abertura não pode ser depois do primeiro ' +
        'movimento registrado.',
    }
  }

  return base
}

/*
 * ─────────────────────── A QUANTIDADE DE ABERTURA ───────────────────────
 *
 * "Hoje tivemos uma abertura de 28 peças mas deveria ser 30 e não tivemos como
 * editar e tivemos que apagar tudo e abrir um novo lote."
 *
 * Apagar e reabrir custa o código do lote, o histórico e a espera acumulada —
 * e, se alguém já tiver movido peça, nem é possível.
 *
 * ── O QUE NÃO PODE ACONTECER ──
 *
 * Baixar a quantidade abaixo do que JÁ SAIU da primeira etapa deixaria saldo
 * negativo: o lote teria mandado adiante mais peça do que jamais teve. Num
 * livro-razão isso não é um número feio na tela — é a conta de estoque, de
 * perda e de custo, todas erradas ao mesmo tempo, e sem nada que aponte para
 * aqui semanas depois.
 */

export type AvaliacaoDeQuantidade =
  | { ok: true; diferenca: number }
  | { ok: false; erro: string }

/**
 * @param nova    a quantidade que a pessoa digitou
 * @param atual   a que está gravada no movimento de abertura
 * @param jaSaiuDaPrimeira a soma de TUDO que já saiu da primeira etapa —
 *                avanço, perda, segunda, divisão
 *
 * ── POR QUE "JÁ SAIU", E NÃO "SALDO ATUAL" ──
 *
 * A primeira versão desta regra olhava o saldo parado na primeira etapa, e a
 * conta parecia certa: não deixar ficar negativo. Só que o quadro permite
 * RETORNO de etapa. Um lote de 28 que avançou inteiro e voltou inteiro tem 28
 * de saldo de novo — e a regra do saldo deixava baixar a abertura para 1. As
 * outras 27 sumiam do total sem nenhum movimento de perda, sem saldo negativo
 * e sem nada na tela, porque `calcularSaldos` descarta entrada zerada. Peça que
 * evapora do estoque sem virar perda é o pior desfecho possível: a taxa de
 * perda continua bonita e o custo por peça vem baixo demais.
 *
 * O que de fato dá para desdizer é a peça que NUNCA participou de movimento
 * nenhum — as que ainda estão paradas onde nasceram e jamais saíram de lá.
 */
export function avaliarQuantidadeDeAbertura(
  nova: number,
  atual: number,
  jaSaiuDaPrimeira: number,
): AvaliacaoDeQuantidade {
  if (!Number.isInteger(nova) || nova < 1) {
    return { ok: false, erro: 'A quantidade precisa ser um número inteiro, de 1 para cima.' }
  }
  if (nova === atual) return { ok: true, diferenca: 0 }

  if (nova < jaSaiuDaPrimeira) {
    return {
      ok: false,
      erro:
        `Este lote já movimentou ${jaSaiuDaPrimeira} peça(s) para fora da primeira etapa, então ` +
        `a abertura não pode baixar de ${jaSaiuDaPrimeira}. Se peça sumiu, registre a perda pelo ` +
        'quadro — é o que mantém a conta de perda honesta.',
    }
  }

  return { ok: true, diferenca: nova - atual }
}

/*
 * A OBSERVAÇÃO QUE O PRÓPRIO SISTEMA ESCREVEU.
 *
 * `dividirLote` grava "Dividido de L-0031." no mesmo campo em que a pessoa
 * escreve o recado dela. Passou despercebido enquanto nada exibia observação;
 * agora que o cartão do quadro mostra, todo lote de divisão ganharia uma tarja
 * repetindo o que a linha "veio do L-0031" logo acima já diz.
 */
const FRASES_AUTOMATICAS = [/^Separado de L-\d+\.?$/i, /^Dividido de L-\d+\.?$/i, /^Separado de L-\d+ para esmaltar\.?$/i]

export function ehObservacaoAutomatica(texto: string | null | undefined): boolean {
  if (!texto) return false
  const limpo = texto.trim()
  return FRASES_AUTOMATICAS.some((r) => r.test(limpo))
}
