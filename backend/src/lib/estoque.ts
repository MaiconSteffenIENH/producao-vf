/*
 * OS DOIS ESTOQUES DO ATELIÊ — e por que eles não podem ser a mesma tela.
 *
 * BISCOITO é peça queimada uma vez e ainda SEM cor. Não é "quase pronto": é o
 * PULMÃO. Enquanto está ali, aquela peça ainda pode virar qualquer esmalte, e
 * por isso o que interessa não é o total, é a DISTÂNCIA ATÉ O MÍNIMO de cada
 * peça. Daí a ordenação deste arquivo. Em ordem alfabética, a peça zerada
 * dorme no fim da lista enquanto a que está no mínimo abre a tela — e o dia
 * seria decidido pela letra do nome.
 *
 * PRONTAS é o outro extremo do caminho: peça que passou por tudo, inclusive
 * esmaltação e 2ª queima. Aqui a cor já existe, então a granularidade é
 * peça+esmalte: o Bowl não vende, o Bowl Pistache vende.
 *
 * E aqui mora a regra que este arquivo existe para ninguém esquecer:
 *
 *     PRONTO NÃO É VENDÁVEL.
 *
 * Peça cuja combinação não tem foto publicada está na prateleira e não está na
 * loja. Somar as duas coisas num número só mentiria sobre o estoque na direção
 * mais cara possível: a Vera leria "40 prontas", pararia de produzir, e a loja
 * continuaria sem nada para vender. Por isso `vendaveis` e `travadas` são
 * campos separados, e nenhuma função devolve o total sozinho.
 *
 * Puro de propósito: nada de Prisma. Todo saldo chega pronto de quem soube
 * somar o livro-razão (lib/saldos.ts) — nenhum número daqui é campo gravado.
 */

// ───────────────────────── Biscoito: o pulmão ─────────────────────────

export type EntradaDeBiscoito = {
  pecaId: string
  peca: string
  categoria?: string | null
  /** saldo neutro parado na etapa de biscoito */
  emBiscoito: number
  /** `Peca.qtdMinimaBiscoito`; zero quer dizer "ninguém definiu ainda" */
  minimo: number
  /** ainda sem cor e antes do biscoito no roteiro: vira pulmão sem voltar ao torno */
  aCaminho?: number
  /** 40 peças num lote só não é a mesma coisa que 40 em oito lotes */
  lotes?: number
}

export type LinhaDeBiscoito = {
  pecaId: string
  peca: string
  categoria: string | null
  emBiscoito: number
  minimo: number
  aCaminho: number
  lotes: number
  /** quanto falta para o mínimo; zero quando já está atendido */
  faltam: number
  abaixoDoMinimo: boolean
  /** ninguém definiu o mínimo desta peça — a linha vira sugestão de cadastro */
  semMinimo: boolean
  /** quanto do mínimo já está coberto, em %; `null` sem mínimo definido */
  percentualDoMinimo: number | null
  /** falta agora, mas o que já vem a caminho fecha a conta sem começar nada */
  cobertoPeloQueVem: boolean
}

export type ResumoDeBiscoito = {
  pecas: number
  emBiscoito: number
  aCaminho: number
  /** quantas peças estão abaixo do mínimo — é o número que decide o dia */
  abaixoDoMinimo: number
  /** soma do que falta em todas elas */
  faltamNoTotal: number
  semMinimo: number
}

/** 0 = falta; 1 = atendida; 2 = sem mínimo definido. */
function ordemDeAtencao(linha: LinhaDeBiscoito): number {
  if (linha.abaixoDoMinimo) return 0
  return linha.semMinimo ? 2 : 1
}

const fracaoDoMinimo = (linha: LinhaDeBiscoito): number =>
  linha.minimo > 0 ? linha.emBiscoito / linha.minimo : 0

/**
 * As linhas do estoque de biscoito, na ordem em que resolvem o dia.
 *
 * A urgência é a FRAÇÃO do mínimo, não o número absoluto que falta: zero de 10
 * é ruptura do pulmão (nenhuma cor pode ser atendida sem começar do torno),
 * enquanto 60 de 100 ainda atende quase tudo — mesmo faltando quatro vezes
 * mais peças. Ordenar por `faltam` deixaria a peça zerada embaixo.
 *
 * Entre duas igualmente vazias, ganha a que não tem nada a caminho: a outra se
 * recompõe sozinha quando o forno abrir.
 */
export function linhasDeBiscoito(entradas: EntradaDeBiscoito[]): LinhaDeBiscoito[] {
  const linhas: LinhaDeBiscoito[] = entradas.map((e) => {
    // saldo negativo não existe no livro-razão, mas se existisse viraria
    // "cobertura negativa" e ordenaria acima de quem está de fato zerado
    const emBiscoito = Math.max(0, e.emBiscoito)
    const minimo = Math.max(0, e.minimo)
    const aCaminho = Math.max(0, e.aCaminho ?? 0)
    const faltam = Math.max(0, minimo - emBiscoito)
    return {
      pecaId: e.pecaId,
      peca: e.peca,
      categoria: e.categoria ?? null,
      emBiscoito,
      minimo,
      aCaminho,
      lotes: Math.max(0, e.lotes ?? 0),
      faltam,
      abaixoDoMinimo: faltam > 0,
      semMinimo: minimo === 0,
      /*
       * `Math.floor` e teto de 99 enquanto falta alguma coisa: com round, 199
       * de 200 marcava 100%, a barra ficava verde e o aria-label dizia "100%
       * do mínimo" na mesma linha em que a etiqueta dizia "faltam 1". Número
       * que se contradiz na própria linha é pior do que número nenhum.
       */
      percentualDoMinimo:
        minimo > 0
          ? faltam > 0
            ? Math.min(99, Math.floor((emBiscoito / minimo) * 100))
            : Math.floor((emBiscoito / minimo) * 100)
          : null,
      cobertoPeloQueVem: faltam > 0 && emBiscoito + aCaminho >= minimo,
    }
  })

  return linhas.sort((a, b) => {
    const atencao = ordemDeAtencao(a) - ordemDeAtencao(b)
    if (atencao !== 0) return atencao
    // sem mínimo não tem distância a percorrer: mostra primeiro quem tem mais
    // peça parada, que é onde definir um mínimo muda alguma coisa
    if (a.semMinimo && b.semMinimo) {
      if (b.emBiscoito !== a.emBiscoito) return b.emBiscoito - a.emBiscoito
      return a.peca.localeCompare(b.peca, 'pt-BR')
    }
    const fracao = fracaoDoMinimo(a) - fracaoDoMinimo(b)
    if (fracao !== 0) return fracao
    if (a.cobertoPeloQueVem !== b.cobertoPeloQueVem) return a.cobertoPeloQueVem ? 1 : -1
    if (b.faltam !== a.faltam) return b.faltam - a.faltam
    return a.peca.localeCompare(b.peca, 'pt-BR')
  })
}

export function resumoDeBiscoito(linhas: LinhaDeBiscoito[]): ResumoDeBiscoito {
  return {
    pecas: linhas.length,
    emBiscoito: linhas.reduce((n, l) => n + l.emBiscoito, 0),
    aCaminho: linhas.reduce((n, l) => n + l.aCaminho, 0),
    abaixoDoMinimo: linhas.filter((l) => l.abaixoDoMinimo).length,
    faltamNoTotal: linhas.reduce((n, l) => n + l.faltam, 0),
    semMinimo: linhas.filter((l) => l.semMinimo).length,
  }
}

export function visaoDoBiscoito(entradas: EntradaDeBiscoito[]): {
  linhas: LinhaDeBiscoito[]
  resumo: ResumoDeBiscoito
} {
  const linhas = linhasDeBiscoito(entradas)
  return { linhas, resumo: resumoDeBiscoito(linhas) }
}

// ────────────────────── Prontas: pronto ≠ vendável ──────────────────────

/**
 * A última casa do ciclo da foto. O ciclo inteiro mora em foto.service.ts, mas
 * importá-lo aqui traria o Prisma junto e este arquivo perderia o que ele tem
 * de melhor, que é rodar sem banco. Só esta casa importa para o estoque.
 */
export const FOTO_PUBLICADA = 'publicado'

/**
 * `sem_esmalte` não é o mesmo problema que `sem_foto`, e juntar os dois mandaria
 * a pessoa para a tela errada: um se resolve na tela de Fotos, o outro só se
 * resolve descobrindo de que cor aquele lote é.
 */
export type SituacaoDaPronta = 'vendavel' | 'sem_foto' | 'sem_esmalte'

export type EntradaDeProntas = {
  pecaId: string
  peca: string
  /** `null` = lote chegou ao fim sem esmalte atribuído */
  corId: string | null
  cor: string | null
  corHex?: string | null
  malhado?: boolean
  amostraUrl?: string | null
  prontas: number
  /** já esmaltado nesta cor, ainda não pronto */
  aCaminho?: number
  /** ciclo da foto; `null` quando a combinação nem está cadastrada */
  fotoStatus?: string | null
}

export type LinhaDeProntas = {
  pecaId: string
  peca: string
  corId: string | null
  cor: string | null
  corHex: string | null
  malhado: boolean
  amostraUrl: string | null
  prontas: number
  aCaminho: number
  /** pode ser anunciada hoje */
  vendaveis: number
  /** existe, não pode ser anunciada, e a culpa é da foto */
  travadas: number
  fotoStatus: string | null
  situacao: SituacaoDaPronta
}

export type GrupoDeProntas = {
  pecaId: string
  peca: string
  prontas: number
  vendaveis: number
  travadas: number
  semEsmalte: number
  aCaminho: number
  linhas: LinhaDeProntas[]
}

export type ResumoDeProntas = {
  pecas: number
  combinacoes: number
  prontas: number
  vendaveis: number
  /** peças (não combinações) que existem e não podem ser vendidas por falta de foto */
  travadas: number
  combinacoesTravadas: number
  semEsmalte: number
}

/** 0 = travada pela foto; 1 = sem esmalte; 2 = pronta para vender. */
function ordemDaLinha(linha: LinhaDeProntas): number {
  if (linha.situacao === 'sem_foto') return 0
  return linha.situacao === 'sem_esmalte' ? 1 : 2
}

function classificar(entrada: EntradaDeProntas): LinhaDeProntas {
  const prontas = Math.max(0, entrada.prontas)
  const fotoStatus = entrada.fotoStatus ?? null
  const semEsmalte = entrada.corId === null
  const publicada = !semEsmalte && fotoStatus === FOTO_PUBLICADA
  return {
    pecaId: entrada.pecaId,
    peca: entrada.peca,
    corId: entrada.corId,
    cor: entrada.cor,
    corHex: entrada.corHex ?? null,
    malhado: entrada.malhado ?? false,
    amostraUrl: entrada.amostraUrl ?? null,
    prontas,
    aCaminho: Math.max(0, entrada.aCaminho ?? 0),
    vendaveis: publicada ? prontas : 0,
    // peça sem esmalte também não vende, mas não é a foto que a segura —
    // contá-la como travada mandaria a Vera fotografar o que não tem cor
    travadas: !semEsmalte && !publicada ? prontas : 0,
    fotoStatus,
    situacao: semEsmalte ? 'sem_esmalte' : publicada ? 'vendavel' : 'sem_foto',
  }
}

/**
 * O estoque pronto agrupado por peça, com o detalhe por esmalte.
 *
 * Combinação com zero peça não entra: numa tela de estoque ela é ruído, e o
 * catálogo inteiro de peça+cor já é a tela de Fotos. Aqui só aparece o que
 * existe na prateleira.
 *
 * A ordem é o PREJUÍZO, como na fila de fotos: peça com unidade travada vem
 * primeiro, porque é dinheiro parado que só depende de uma foto para virar
 * venda.
 */
export function visaoDasProntas(entradas: EntradaDeProntas[]): {
  grupos: GrupoDeProntas[]
  resumo: ResumoDeProntas
} {
  const porPeca = new Map<string, GrupoDeProntas>()

  for (const entrada of entradas) {
    const linha = classificar(entrada)
    if (linha.prontas <= 0) continue
    const grupo = porPeca.get(linha.pecaId) ?? {
      pecaId: linha.pecaId,
      peca: linha.peca,
      prontas: 0,
      vendaveis: 0,
      travadas: 0,
      semEsmalte: 0,
      aCaminho: 0,
      linhas: [],
    }
    grupo.prontas += linha.prontas
    grupo.vendaveis += linha.vendaveis
    grupo.travadas += linha.travadas
    grupo.semEsmalte += linha.situacao === 'sem_esmalte' ? linha.prontas : 0
    grupo.aCaminho += linha.aCaminho
    grupo.linhas.push(linha)
    porPeca.set(linha.pecaId, grupo)
  }

  const grupos = [...porPeca.values()]
  for (const grupo of grupos) {
    grupo.linhas.sort((a, b) => {
      const atencao = ordemDaLinha(a) - ordemDaLinha(b)
      if (atencao !== 0) return atencao
      if (b.prontas !== a.prontas) return b.prontas - a.prontas
      return (a.cor ?? '').localeCompare(b.cor ?? '', 'pt-BR')
    })
  }

  grupos.sort((a, b) => {
    if (b.travadas !== a.travadas) return b.travadas - a.travadas
    if (b.prontas !== a.prontas) return b.prontas - a.prontas
    return a.peca.localeCompare(b.peca, 'pt-BR')
  })

  const linhas = grupos.flatMap((g) => g.linhas)
  return {
    grupos,
    resumo: {
      pecas: grupos.length,
      combinacoes: linhas.length,
      prontas: linhas.reduce((n, l) => n + l.prontas, 0),
      vendaveis: linhas.reduce((n, l) => n + l.vendaveis, 0),
      travadas: linhas.reduce((n, l) => n + l.travadas, 0),
      combinacoesTravadas: linhas.filter((l) => l.travadas > 0).length,
      semEsmalte: linhas.reduce((n, l) => n + (l.situacao === 'sem_esmalte' ? l.prontas : 0), 0),
    },
  }
}
