/*
 * O QUE ACONTECE QUANDO A FORNADA ACABA.
 *
 * Até aqui, marcar a fornada como concluída só trocava uma palavra na tela. As
 * peças continuavam paradas na etapa de queima, e quem operou o forno tinha de
 * ir ao quadro arrastar lote por lote — dizendo pela segunda vez o que já tinha
 * dito ao concluir. Uma carga de 80 peças costuma ser 6 a 8 lotes.
 *
 * Esta é a conta que decide, para cada lote da carga, quanto se perdeu e quanto
 * segue viagem. É conta, então mora aqui e se testa sem banco.
 *
 * ── POR QUE NÃO BASTA "AVANÇA TUDO QUE ESTÁ NA ETAPA" ──
 *
 * O saldo parado na etapa de queima não é o mesmo que a carga. Se há 100 peças
 * de um lote esperando e o forno leva 80, a fornada levou 80 — as outras 20
 * ficaram na prateleira esperando a próxima. Avançar pelo saldo mandaria para
 * frente 20 peças que nunca viram fogo, e ninguém perceberia até a peça crua
 * aparecer no estoque de biscoito.
 *
 * Também não basta "avança o que está na carga": entre montar a fornada e
 * concluí-la alguém pode ter mexido no lote pelo quadro. Por isso o número é
 * sempre o MENOR dos dois — o que entrou no forno e o que ainda está lá.
 *
 * ── A QUEBRA SAI DA CARGA, NÃO DO SALDO ──
 *
 * Quem operou o forno viu quebrar o que estava DENTRO dele. Deixar informar
 * mais quebra do que a carga transformaria a conclusão numa porta lateral para
 * dar baixa em peça que estava na prateleira, sem passar pelo quadro.
 */

export type ItemDaCarga = {
  loteId: string
  /** o código do lote, para a mensagem ficar legível ("L-0031") */
  codigo: string
  pecaNome: string
  /** quanto deste lote entrou na fornada */
  quantidade: number
}

export type EstadoDoLote = {
  /** quanto ainda está parado na etapa de queima agora */
  saldo: number
  /** a etapa de queima onde ele está */
  etapaId: string
  /** para onde vai depois; nulo quando a queima é a última parada do roteiro */
  proximaEtapaId: string | null
  /**
   * A próxima etapa é a que escolhe o esmalte?
   *
   * Se for, e o lote ainda estiver neutro, NÃO dá para avançar sozinho: alguém
   * precisa dizer qual cor. O sistema não tem como inventar isso, e mandar sem
   * cor faria a conclusão inteira estourar no meio — deixando a fornada presa,
   * com uns lotes movidos e outros não.
   */
  proximaDefineCor?: boolean
  /** a cor já decidida deste lote, se houver */
  corDoLote?: string | null
  /**
   * Quanto deste lote JÁ foi gravado como perda desta mesma fornada.
   *
   * Existe por causa da segunda tentativa. Se a conclusão morreu depois de
   * gravar a perda e antes do avanço, o saldo da etapa já está sem as peças
   * quebradas. Descontar a quebra de novo deixaria peça encalhada na etapa de
   * queima, com a resposta na tela dizendo que tudo saiu.
   */
  jaPerdido?: number
}

export type AcaoDaConclusao = {
  loteId: string
  codigo: string
  etapaOrigemId: string
  etapaDestinoId: string | null
  /** quantas seguem para a próxima etapa */
  avancar: number
  /** quantas foram perdidas no forno AGORA (perda já gravada não conta de novo) */
  perder: number
  /** o esmalte a informar no avanço, quando a etapa de destino exige um */
  corId?: string | null
}

export type PlanoDeConclusao = {
  acoes: AcaoDaConclusao[]
  /** o que a pessoa precisa ler depois, em português do ateliê */
  avisos: string[]
  /**
   * O que IMPEDE a fornada de ser concluída.
   *
   * Diferente de aviso: aviso é "segui em frente e você precisa saber disto";
   * bloqueio é "não dá para fechar esta fornada sem alguém arrumar o cadastro".
   * Fechar assim mesmo marcaria como concluída uma fornada com peça dentro — e
   * o botão de concluir só aparece enquanto ela está queimando, então não
   * haveria caminho de volta pela tela.
   */
  bloqueios: string[]
  totalAvancado: number
  totalPerdido: number
}

/** Erro de preenchimento: a mensagem vai direto para a tela. */
export class QuebraInvalida extends Error {}

/**
 * Monta o plano da conclusão.
 *
 * Não escreve nada e não conhece Prisma: recebe o retrato do banco, devolve a
 * lista de movimentos a gravar. Quem grava é o serviço.
 */
export function planejarConclusao(
  itens: readonly ItemDaCarga[],
  estados: ReadonlyMap<string, EstadoDoLote>,
  quebras: ReadonlyMap<string, number>,
): PlanoDeConclusao {
  const acoes: AcaoDaConclusao[] = []
  const avisos: string[] = []
  const bloqueios: string[] = []
  // o total perdido NESTA fornada, contando o que já tinha sido gravado antes:
  // é o número que a pessoa espera ver, e não "0 quebraram" numa repetição
  let totalPerdido = 0

  // quebra informada para lote que nem está na carga é erro de quem chamou,
  // não descuido: significa que a tela mandou outra fornada
  for (const loteId of quebras.keys()) {
    if (!itens.some((i) => i.loteId === loteId)) {
      throw new QuebraInvalida('Há quebra informada para um lote que não está nesta fornada.')
    }
  }

  for (const item of itens) {
    const estado = estados.get(item.loteId)
    const quebrou = quebras.get(item.loteId) ?? 0

    if (!Number.isInteger(quebrou) || quebrou < 0) {
      throw new QuebraInvalida(`A quebra de ${item.codigo} precisa ser um número inteiro, de zero para cima.`)
    }
    if (quebrou > item.quantidade) {
      throw new QuebraInvalida(
        `${item.codigo} entrou no forno com ${item.quantidade}, então não dá para quebrar ${quebrou}.`,
      )
    }

    /*
     * SEM ETAPA DE QUEIMA NO ROTEIRO é problema de cadastro, não descuido.
     *
     * Acontece quando alguém desmarca "aguarda carga" na etapa, ou reescreve o
     * roteiro da peça, entre abrir e concluir a fornada. Tratar isso como
     * "já saiu pelo quadro" seria mentir: as peças estão paradas exatamente
     * onde estavam, e a fornada seria fechada em cima delas.
     */
    if (!estado) {
      bloqueios.push(
        `${item.codigo} (${item.pecaNome}): não achei a etapa de queima no roteiro desta peça. ` +
          'Confira em Etapas se a queima ainda está marcada como "aguarda carga", e o roteiro da peça.',
      )
      continue
    }

    const jaPerdido = estado.jaPerdido ?? 0

    if (estado.saldo <= 0 && jaPerdido <= 0) {
      // já foi movido pelo quadro entre montar e concluir
      if (quebrou > 0) {
        throw new QuebraInvalida(
          `${item.codigo} já saiu da etapa de queima pelo quadro. Registre a quebra por lá — aqui o saldo não confere mais.`,
        )
      }
      avisos.push(`${item.codigo} (${item.pecaNome}) já tinha saído da queima pelo quadro; não mexi nele.`)
      continue
    }

    /*
     * A QUEBRA JÁ GRAVADA MANDA NA QUEBRA INFORMADA.
     *
     * Numa segunda tentativa, o que ficou registrado é a verdade — a chave de
     * idempotência impede regravar de qualquer jeito. Se o João redigitar o
     * mesmo número, aceitar o dele faria a conta descontar a quebra duas vezes:
     * uma no saldo, que já caiu, e outra na subtração aqui.
     */
    const perdido = jaPerdido > 0 ? jaPerdido : quebrou
    if (jaPerdido > 0 && quebrou !== jaPerdido) {
      avisos.push(
        `${item.codigo}: a quebra de ${jaPerdido} desta fornada já estava registrada de uma tentativa ` +
          'anterior. Mantive esse número — para mudá-lo, use o quadro.',
      )
    }

    // o que ainda falta mover: o que entrou no forno menos o que já foi baixado
    const restaDaCarga = Math.max(0, item.quantidade - jaPerdido)
    const naCarga = Math.min(restaDaCarga, estado.saldo)
    if (naCarga < restaDaCarga) {
      avisos.push(
        `${item.codigo}: entraram ${item.quantidade} na fornada, mas só ${naCarga} ainda estão na etapa. ` +
          'Usei o que está lá.',
      )
    }
    if (jaPerdido <= 0 && quebrou > naCarga) {
      throw new QuebraInvalida(
        `${item.codigo} só tem ${naCarga} na etapa de queima, então não dá para quebrar ${quebrou}.`,
      )
    }

    const aQuebrarAgora = jaPerdido > 0 ? 0 : quebrou
    const sobrou = naCarga - aQuebrarAgora

    if (sobrou > 0 && !estado.proximaEtapaId) {
      avisos.push(
        `${item.codigo} (${item.pecaNome}): esta queima é a última parada do roteiro, ` +
          'então não há para onde avançar. Só registrei a quebra, se houve.',
      )
    }

    /*
     * PRÓXIMA PARADA ESCOLHE O ESMALTE E O LOTE AINDA ESTÁ NEUTRO.
     *
     * O avanço exige a cor, e não há de onde tirá-la. Isso é bloqueio e não
     * aviso: se a fornada fechasse assim, as peças ficariam paradas na queima
     * com a fornada marcada como concluída, e o botão de concluir some.
     */
    if (sobrou > 0 && estado.proximaEtapaId && estado.proximaDefineCor && !estado.corDoLote) {
      bloqueios.push(
        `${item.codigo} (${item.pecaNome}): a etapa seguinte é a que escolhe o esmalte, e este lote ` +
          'ainda está neutro. Avance este lote pelo quadro, escolhendo a cor, e conclua a fornada depois.',
      )
      continue
    }

    // sem destino não existe avanço: a peça fica onde está
    const avancar = estado.proximaEtapaId ? sobrou : 0

    totalPerdido += perdido

    // nada a gravar — não vale um movimento vazio no livro-razão
    if (avancar <= 0 && aQuebrarAgora <= 0) continue

    acoes.push({
      loteId: item.loteId,
      codigo: item.codigo,
      etapaOrigemId: estado.etapaId,
      etapaDestinoId: estado.proximaEtapaId,
      avancar,
      perder: aQuebrarAgora,
      /** a cor a informar no avanço, quando a próxima etapa exige uma */
      corId: estado.proximaDefineCor ? (estado.corDoLote ?? null) : null,
    })
  }

  return {
    acoes,
    avisos,
    bloqueios,
    totalAvancado: acoes.reduce((s, a) => s + a.avancar, 0),
    totalPerdido,
  }
}

/**
 * A chave que impede o clique duplo de virar movimento duplo.
 *
 * O ateliê tem sinal ruim e o app é PWA: o João aperta "Concluir", a resposta
 * demora, ele aperta de novo. Sem chave, as 80 peças avançariam duas vezes e o
 * saldo da etapa ficaria negativo — que é o estrago que não dá para desfazer
 * sem entender o livro-razão inteiro.
 *
 * É determinística de propósito: o mesmo lote, na mesma fornada, com o mesmo
 * papel, sempre gera a mesma chave. O reenvio devolve o movimento já gravado.
 */
export function chaveDaConclusao(queimaId: string, loteId: string, papel: 'avanco' | 'perda'): string {
  return `queima:${queimaId}:${loteId}:${papel}`
}
