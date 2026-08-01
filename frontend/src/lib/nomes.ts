/*
 * NOME EM CAIXA ALTA, sem obrigar ninguém a segurar o shift.
 *
 * O ateliê cadastra nome o tempo todo — peça, esmalte, categoria, etapa,
 * cliente — e quem digita rápido escreve tudo minúsculo. A lista fica com
 * "prato de pão" ao lado de "Bowl Recortado" e passa a parecer desleixada por
 * um motivo que não é do ateliê. O Maicon pediu caixa alta, que é também como
 * esses nomes aparecem na etiqueta colada na prateleira.
 *
 * ── POR QUE A CONVERSÃO É SEGURA DE FAZER ENQUANTO A PESSOA DIGITA ──
 *
 * `toLocaleUpperCase('pt-BR')` não muda o comprimento do texto em português:
 * ç→Ç, ã→Ã, é→É, todos um para um. Por isso dá para converter a cada tecla
 * sem o cursor pular — que é o defeito clássico de campo que "se arruma
 * sozinho". Com inicial maiúscula por palavra o risco existiria; com caixa
 * alta, não.
 *
 * ── ONDE ISTO NÃO SE APLICA ──
 *
 * E-mail, senha, link e cor em hexadecimal ficam de fora. E-mail em caixa alta
 * é feio e pode quebrar comparação; senha em caixa alta é perda de dado;
 * link em caixa alta simplesmente não abre. Texto corrido — observação, motivo
 * de perda — também fica fora: frase inteira em maiúscula é mais difícil de
 * ler, e o motivo da perda existe para ser lido depois.
 */

/**
 * Nome como ele deve ficar guardado: caixa alta, sem espaço sobrando.
 *
 * O aperto dos espaços não é enfeite. Nome com espaço duplo passa
 * despercebido na digitação, e depois some da busca e aparece duplicado na
 * lista, porque "PRATO  DE PÃO" e "PRATO DE PÃO" são textos diferentes.
 */
export function caixaAlta(texto: string): string {
  if (!texto) return texto
  return texto.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR')
}

/**
 * A versão para usar ENQUANTO a pessoa digita.
 *
 * Não corta as pontas nem aperta os espaços: fazer isso a cada tecla impediria
 * de escrever "PRATO DE PÃO", porque o espaço depois de "PRATO" sumiria antes
 * da próxima letra chegar. O aperto fica para a hora de salvar.
 */
export function caixaAltaAoDigitar(texto: string): string {
  return texto.toLocaleUpperCase('pt-BR')
}
