/*
 * EXCLUIR UM LOTE — o que pode sumir e o que some junto.
 *
 * O livro-razão é append-only de propósito: o saldo É o histórico, e por isso
 * nenhum MOVIMENTO se apaga. Mas lote aberto por engano é outra coisa — ele
 * não é um erro de registro, é um registro que nunca deveria ter existido.
 * Mantê-lo eternamente não é integridade, é ruído.
 *
 * POR QUE NÃO BASTAVA "CANCELAR". Cancelar joga o saldo restante como PERDA,
 * e `perdaDaPeca()` lê exatamente esses movimentos. Usar cancelamento para
 * limpar lote de teste inflaria a perda medida da peça — e a perda medida
 * alimenta duas contas silenciosamente: a quantidade que o planejamento manda
 * produzir (`quantidadeComPerda`) e o custo real por peça na precificação.
 * Limpar bagunça não pode encarecer o produto.
 *
 * O QUE ESTA LÓGICA PROTEGE. Só uma coisa: que apagar um lote não estrague, em
 * silêncio, um registro que CONTINUA existindo. Daí o único bloqueio ser o
 * lote-pai — o filho nasceu de uma divisão dele, e sem o pai o movimento
 * "entrou por divisão" do filho passa a apontar para o nada. Não é proibição,
 * é ordem: apague o filho primeiro. O resto é aviso, não impedimento — quem
 * apaga vê antes o que vai junto e decide.
 */

export type LoteParaExcluir = {
  codigo: string
  /** quantos movimentos existem no livro-razão deste lote */
  movimentos: number
  /** lotes que nasceram de uma divisão DESTE lote */
  divisoes: { codigo: string }[]
  /** fornadas em que este lote está carregado */
  fornadas: { codigo: string; status: string }[]
  /** encomenda a que o lote pertence, e quantos OUTROS lotes ela ainda tem */
  encomenda: { codigo: string; outrosLotes: number } | null
}

export type Exclusao = {
  /** false quando existe um lote-filho que precisa sair antes */
  pode: boolean
  /** preenchido só quando `pode` é false */
  impedimento: string | null
  /** o que some ou muda junto — mostrado na confirmação, nunca bloqueia */
  avisos: string[]
  /** a encomenda ficaria sem nenhum lote e deve voltar para "aberta" */
  soltarEncomenda: boolean
}

const listar = (nomes: string[]) =>
  nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`

export function avaliarExclusao(lote: LoteParaExcluir): Exclusao {
  const avisos: string[] = []

  if (lote.divisoes.length > 0) {
    const filhos = listar(lote.divisoes.map((d) => d.codigo))
    const plural = lote.divisoes.length === 1
      ? `o lote ${filhos} nasceu`
      : `os lotes ${filhos} nasceram`
    return {
      pode: false,
      impedimento:
        `Não dá para apagar ${lote.codigo} agora: ${plural} de uma divisão dele. ` +
        `Apague ${lote.divisoes.length === 1 ? 'o lote-filho' : 'os lotes-filhos'} primeiro.`,
      avisos: [],
      soltarEncomenda: false,
    }
  }

  if (lote.movimentos > 1) {
    avisos.push(
      `${lote.movimentos} movimentos do histórico deste lote somem junto — ` +
        `inclusive perdas e avanços já registrados.`,
    )
  }

  if (lote.fornadas.length > 0) {
    for (const f of lote.fornadas) {
      avisos.push(
        `O lote sai da fornada ${f.codigo} (${f.status}), que passa a mostrar menos peças do que carregou.`,
      )
    }
  }

  const soltarEncomenda = !!lote.encomenda && lote.encomenda.outrosLotes === 0
  if (soltarEncomenda && lote.encomenda) {
    avisos.push(
      `A encomenda ${lote.encomenda.codigo} fica sem nenhum lote e volta para "aberta".`,
    )
  }

  return { pode: true, impedimento: null, avisos, soltarEncomenda }
}
