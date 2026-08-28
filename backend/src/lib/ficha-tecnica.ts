/*
 * A FICHA TÉCNICA DA PEÇA — o padrão a ser seguido ao reproduzi-la.
 *
 * Pedido do João: hoje o sistema sabe por onde a peça passa, mas não sabe de
 * que argila ela é feita nem que tamanho ela deveria ter. Sem isso, cada pessoa
 * reproduz de memória e a diferença só aparece quando as peças estão lado a
 * lado na prateleira — e aí não há o que fazer, porque já queimaram.
 *
 * ── AS DUAS COISAS QUE ESTE ARQUIVO EXISTE PARA NÃO DEIXAR ESQUECER ──
 *
 * 1. MEDIDA SEM TOLERÂNCIA NÃO SERVE PARA PEÇA ARTESANAL. Duas peças do mesmo
 *    molde não saem idênticas, e nem deveriam. Uma ficha que diz "8 cm" seco
 *    reprova a produção inteira, e o que acontece na prática é a equipe parar
 *    de olhar o campo. Por isso a ficha guarda a FAIXA, não o ponto.
 *
 * 2. A ARGILA ENCOLHE NA QUEIMA. A mesma peça mede diferente antes e depois do
 *    forno — a retração típica fica entre 10% e 15%, variando com a argila e a
 *    temperatura. Comparar uma medida de cru com uma de pronto dá uma diferença
 *    que parece defeito e é só física. Daí `momento` ser obrigatório sempre que
 *    houver qualquer medida: sem ele, o número não significa nada.
 *
 * Puro de propósito — sem Prisma. A conta é testável sem banco.
 */

export type MomentoDaMedida = 'cru' | 'pronto'

export const MOMENTOS: readonly MomentoDaMedida[] = ['cru', 'pronto']

export const ROTULO_MOMENTO: Record<MomentoDaMedida, string> = {
  cru: 'peça crua, antes de secar',
  pronto: 'peça pronta, depois da 2ª queima',
}

/** As medidas como elas vêm do cadastro; `null` é "ninguém definiu ainda". */
export type MedidasDaPeca = {
  alturaCm: number | null
  /** a medida mais larga do corpo */
  larguraCm: number | null
  /** abertura de cima; o oleiro confere com o compasso enquanto torneia */
  diametroBocaCm: number | null
  /** apoio de baixo; peça que não assenta reta volta torta da queima */
  diametroBaseCm: number | null
  capacidadeMl: number | null
  pesoCruG: number | null
  momento: MomentoDaMedida | null
  toleranciaPct: number | null
}

export type FaixaAceitavel = {
  /** o valor cadastrado, que é o alvo */
  alvo: number
  minimo: number
  maximo: number
}

/**
 * A faixa aceitável de uma medida, dada a tolerância.
 *
 * Sem tolerância cadastrada devolve a faixa degenerada (mínimo = máximo = alvo)
 * em vez de `null`: quem chama quer desenhar a linha do mesmo jeito, e tratar
 * "sem tolerância" como caso especial em cada tela espalharia a regra.
 *
 * O arredondamento é para uma casa porque é o que a régua do ateliê lê. Duas
 * casas dariam a impressão de precisão que a medição não tem.
 */
export function faixaDaMedida(alvo: number, toleranciaPct: number | null): FaixaAceitavel {
  const pct = Math.max(0, Math.min(100, toleranciaPct ?? 0))
  const margem = (alvo * pct) / 100
  return {
    alvo: umaCasa(alvo),
    minimo: umaCasa(alvo - margem),
    maximo: umaCasa(alvo + margem),
  }
}

const umaCasa = (n: number) => Math.round(n * 10) / 10

/**
 * A peça medida está dentro do padrão?
 *
 * Fora da faixa por arredondamento não é fora do padrão: a comparação usa a
 * faixa já arredondada, que é a que a pessoa lê na tela. Se a tela mostra
 * "7,6 a 8,4" e a peça deu 8,4, dizer que reprovou seria contradizer a própria
 * tela — e é a tela que a equipe acredita.
 */
export function dentroDoPadrao(medido: number, alvo: number, toleranciaPct: number | null): boolean {
  const faixa = faixaDaMedida(alvo, toleranciaPct)
  const m = umaCasa(medido)
  return m >= faixa.minimo && m <= faixa.maximo
}

/** A peça tem alguma medida cadastrada? */
export function temMedida(m: MedidasDaPeca): boolean {
  return (
    m.alturaCm !== null ||
    m.larguraCm !== null ||
    m.diametroBocaCm !== null ||
    m.diametroBaseCm !== null ||
    m.capacidadeMl !== null ||
    m.pesoCruG !== null
  )
}

export type ProblemaNaFicha = { campo: string; mensagem: string }

/**
 * O que impede esta ficha de servir como padrão.
 *
 * NÃO é validação de formulário — o zod já recusa número negativo. É a conferência
 * de COERÊNCIA, que só faz sentido olhando os campos juntos, e é por isso que
 * mora aqui e não no schema.
 *
 * Devolve lista em vez de estourar no primeiro problema: quem cadastra quer
 * saber tudo o que falta de uma vez, não descobrir um erro por vez a cada
 * tentativa de salvar.
 */
export function conferirFicha(m: MedidasDaPeca): ProblemaNaFicha[] {
  const problemas: ProblemaNaFicha[] = []

  // O caso que motivou este arquivo: medida sem momento não significa nada,
  // porque a argila encolhe entre um e outro.
  if (temMedida(m) && !m.momento) {
    problemas.push({
      campo: 'medidasMomento',
      mensagem:
        'Informe se as medidas são da peça crua ou da peça pronta. A argila encolhe na queima, ' +
        'então o mesmo número quer dizer tamanhos diferentes nos dois momentos.',
    })
  }

  // Momento escolhido sem nenhuma medida é campo preenchido à toa, e faz a
  // ficha parecer completa numa listagem que só olha se o momento existe.
  if (m.momento && !temMedida(m)) {
    problemas.push({
      campo: 'medidasMomento',
      mensagem: 'Você escolheu o momento da medição, mas não informou nenhuma medida.',
    })
  }

  // Tolerância sozinha não tem sobre o que incidir.
  if (m.toleranciaPct !== null && !temMedida(m)) {
    problemas.push({
      campo: 'medidaToleranciaPct',
      mensagem: 'A tolerância só vale quando há alguma medida cadastrada.',
    })
  }

  /*
   * PESO DO CRU só existe no cru. Deixar passar "peso do barro cru" numa ficha
   * declarada como pronta produz o erro mais caro deste cadastro: alguém pesa a
   * bola de argila esperando o número da peça queimada, que é 10% a 15% menor
   * pela perda de água. O oleiro tornearia peça pequena a manhã inteira.
   */
  if (m.pesoCruG !== null && m.momento === 'pronto') {
    problemas.push({
      campo: 'pesoCruG',
      mensagem:
        'O peso do barro cru não combina com uma ficha medida na peça pronta. ' +
        'Ou a ficha é do cru, ou este peso é de outro momento.',
    })
  }

  /*
   * Boca ou base MAIOR que a largura não é peça exótica: é contradição.
   *
   * `larguraCm` está definida como a medida mais larga do corpo. Se a abertura
   * de cima passa dela, uma das duas está errada — e a ficha vai para a bancada
   * mandando o oleiro tornear algo impossível.
   *
   * A comparação usa a faixa de tolerância, e não o valor cravado: numa peça
   * reta a boca é igual à largura, e medir 9,5 num lugar e 9,4 no outro é a
   * variação normal do trabalho, não erro de cadastro.
   */
  if (m.larguraCm !== null && m.toleranciaPct !== null) {
    const teto = faixaDaMedida(m.larguraCm, m.toleranciaPct).maximo
    if (m.diametroBocaCm !== null && m.diametroBocaCm > teto) {
      problemas.push({
        campo: 'diametroBocaCm',
        mensagem: `A boca (${m.diametroBocaCm} cm) não pode passar da largura da peça (${m.larguraCm} cm).`,
      })
    }
    if (m.diametroBaseCm !== null && m.diametroBaseCm > teto) {
      problemas.push({
        campo: 'diametroBaseCm',
        mensagem: `A base (${m.diametroBaseCm} cm) não pode passar da largura da peça (${m.larguraCm} cm).`,
      })
    }
  }

  // Peça mais larga que alta ou mais alta que larga é normal — bowl e vaso
  // existem. O que não existe é peça que cabe mais líquido do que o volume do
  // cilindro que a contém: aí uma das duas medidas está errada.
  if (m.capacidadeMl !== null && m.alturaCm !== null && m.larguraCm !== null) {
    const raio = m.larguraCm / 2
    const volumeMaximoMl = Math.PI * raio * raio * m.alturaCm // 1 cm³ = 1 ml
    if (m.capacidadeMl > volumeMaximoMl) {
      problemas.push({
        campo: 'capacidadeMl',
        mensagem:
          `Com ${m.larguraCm} cm de largura e ${m.alturaCm} cm de altura, a peça comporta no ` +
          `máximo cerca de ${Math.floor(volumeMaximoMl)} ml. Confira a capacidade ou as medidas.`,
      })
    }
  }

  return problemas
}

/**
 * A ficha em uma linha, do jeito que aparece no cartão da peça.
 *
 * Devolve string vazia quando não há nada — quem chama decide se mostra
 * "sem padrão definido" ou se some com a linha. Devolver "sem padrão" daqui
 * obrigaria toda tela a usar exatamente essa frase.
 */
export function resumoDaFicha(m: MedidasDaPeca): string {
  const partes: string[] = []
  if (m.alturaCm !== null) partes.push(`${formatar(m.alturaCm)} cm de altura`)
  if (m.larguraCm !== null) partes.push(`${formatar(m.larguraCm)} cm de largura`)
  if (m.diametroBocaCm !== null) partes.push(`boca ${formatar(m.diametroBocaCm)} cm`)
  if (m.diametroBaseCm !== null) partes.push(`base ${formatar(m.diametroBaseCm)} cm`)
  if (m.capacidadeMl !== null) partes.push(`${m.capacidadeMl} ml`)
  if (m.pesoCruG !== null) partes.push(`${m.pesoCruG} g de barro`)
  if (partes.length === 0) return ''

  const medidas = partes.join(' · ')
  const tolerancia = m.toleranciaPct ? `, ± ${formatar(m.toleranciaPct)}%` : ''
  const momento = m.momento === 'cru' ? ' (medida no cru)' : ''
  return `${medidas}${tolerancia}${momento}`
}

/*
 * ─────────── A ARGILA: o consumo que não precisa ser digitado ───────────
 *
 * O peso do barro cru JÁ É a quantidade de argila que a peça consome. Uma peça
 * de 420 g tira 420 g do estoque de argila — não há segundo número a informar.
 *
 * Isso importa mais do que parece. A primeira versão deste cadastro pedia a
 * argila numa tabela de insumos, com quantidade própria, e aí passavam a existir
 * DOIS números para a mesma coisa: o peso na ficha técnica e a quantidade no
 * insumo. Eles divergem no primeiro ajuste que alguém faz em um e esquece no
 * outro, e a partir daí a compra é calculada por um número que ninguém revisa.
 */

/** Quanto vale 1 grama na unidade da matéria-prima. `null` = não dá para converter. */
function fatorDoGrama(unidade: string): number | null {
  const u = unidade.trim().toLocaleLowerCase('pt-BR')
  if (u === 'g' || u === 'grama' || u === 'gramas') return 1
  if (u === 'kg' || u === 'quilo' || u === 'quilos') return 0.001
  // "un", "saco", "pacote": não há conversão possível a partir de gramas, e
  // inventar uma faria o sistema mandar comprar 420 sacos de argila
  return null
}

/**
 * O consumo de argila por peça, na unidade em que a argila é comprada.
 *
 * Devolve `null` quando falta argila, falta peso, ou quando a unidade não é de
 * massa. Nesses casos a peça simplesmente não entra na conta de compra de
 * argila — que é melhor do que entrar com um número inventado.
 */
export function consumoDeArgila(pesoCruG: number | null, unidadeDaArgila: string): number | null {
  if (pesoCruG === null || pesoCruG <= 0) return null
  const fator = fatorDoGrama(unidadeDaArgila)
  if (fator === null) return null
  // três casas: é a precisão com que o estoque de insumo é guardado (kg com
  // grama), e arredondar menos faria peça leve sumir da conta
  return Math.round(pesoCruG * fator * 1000) / 1000
}

/** 8 e não 8,0; 7,5 continua 7,5. Casa decimal à toa polui a linha do cartão. */
function formatar(n: number): string {
  const arredondado = umaCasa(n)
  return Number.isInteger(arredondado)
    ? String(arredondado)
    : arredondado.toFixed(1).replace('.', ',')
}
