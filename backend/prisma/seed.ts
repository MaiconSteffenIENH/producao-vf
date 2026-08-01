import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { normalizarBusca } from '../src/lib/busca'

const prisma = new PrismaClient()

/**
 * Esmaltes. Os hex foram medidos das fotos reais das peças (mediana da
 * superfície, descartando brilho e o fundo de palhinha).
 *
 * Atenção: Branco (#D0CDCB) e Pedra Sabão (#CFCEC8) têm praticamente a MESMA
 * cor média — o que separa os dois é a densidade das pintas. Por isso os dois
 * entram com `malhado: true` e a interface mostra foto de amostra, não só o chip.
 */
const CORES = [
  // Medidos das fotos que a Gabi mandou (mediana da superfície, descartando
  // sombra e brilho). A luz de cada foto varia, então todos precisam de uma
  // conferência final com a peça na mão sob luz neutra.
  { nome: 'Branco', hex: '#D9D7DA', malhado: true, observacao: 'Pintas esparsas. Praticamente a mesma cor do Pedra Sabão no chip — distinga pela foto.' },
  { nome: 'Pedra Sabão', hex: '#D5D2CA', malhado: true, observacao: 'Pintas marrons densas, fundo levemente creme. Confunde com o Branco no chip.' },
  { nome: 'Pistache', hex: '#A7C0BC', malhado: true, observacao: 'Verde-água acinzentado com pintas finas.' },
  { nome: 'Azul Safira', hex: '#4E94E0', malhado: false, observacao: 'Azul médio vibrante, superfície uniforme.' },
  { nome: 'Búzios', hex: '#2C4162', malhado: true, observacao: 'Azul-preto profundo com mescla azul clara.' },
  { nome: 'Atacama', hex: '#8B5A4E', malhado: true, observacao: 'Marrom terroso avermelhado, muito malhado.' },
  { nome: 'Vitória Régia', hex: '#7B8062', malhado: true, observacao: 'Verde musgo acinzentado, borda com barro aparente.' },
  { nome: 'Coral', hex: '#D9776B', malhado: true, observacao: 'Rosa coral com pintas pretas; base da peça fica sem esmalte.' },
  // Vistos só no site — hex aproximado, a conferir com peça na mão
  { nome: 'Areia', hex: '#E3CE9B', malhado: true, observacao: 'Hex aproximado (tirado do site) — conferir com peça real.' },
  { nome: 'Azul Água Marinho', hex: '#A9CBDD', malhado: true, observacao: 'Hex aproximado (tirado do site) — conferir com peça real.' },
  { nome: 'Violeta', hex: '#D9B7BC', malhado: true, observacao: 'Hex aproximado (tirado do site) — conferir com peça real.' },
  { nome: 'Preta', hex: '#3A3634', malhado: false, observacao: 'Hex aproximado (tirado do site) — conferir com peça real.' },
]

const CATEGORIAS = ['Bowls', 'Café', 'Manteigueira Francesa', 'Pratos', 'Saladeiras', 'Utilitários']

const RESPONSAVEIS: {
  nome: string
  tipo: string
  cor: string
  capacidadeDiaria: number | null
  capacidadeCarga?: number | null
  horasPorQueima?: number | null
}[] = [
  { nome: 'Oleiro', tipo: 'pessoa', cor: '#8C6E4F', capacidadeDiaria: 40 },
  { nome: 'Vera e Equipe', tipo: 'equipe', cor: '#BBA58C', capacidadeDiaria: 30 },
  // Forno tem capacidade por CARGA, não por dia — ele não trabalha por dia,
  // trabalha por fornada. Os números são um chute inicial para o sistema não
  // nascer mudo; a Vera ajusta com a medida do forno dela.
  { nome: 'Forno 1ª', tipo: 'forno', cor: '#C4703B', capacidadeDiaria: null, capacidadeCarga: 80, horasPorQueima: 24 },
  { nome: 'Forno 2ª', tipo: 'forno', cor: '#A03E2A', capacidadeDiaria: null, capacidadeCarga: 70, horasPorQueima: 30 },
]

const ETAPAS: {
  nome: string
  tipo: string
  ordemPadrao: number
  responsavel: string | null
  defineCor?: boolean
  estoqueIntermediario?: boolean
  aguardaCarga?: boolean
}[] = [
  { nome: 'Oleiro', tipo: 'producao', ordemPadrao: 10, responsavel: 'Oleiro' },
  { nome: 'Equipe Vera', tipo: 'producao', ordemPadrao: 15, responsavel: 'Vera e Equipe' },
  // a peça com alça sai do torno já com as alças; quem faz é o oleiro
  { nome: 'Produção das alças', tipo: 'producao', ordemPadrao: 20, responsavel: 'Oleiro' },
  { nome: 'Colagem', tipo: 'producao', ordemPadrao: 30, responsavel: 'Vera e Equipe' },
  { nome: 'Secagem', tipo: 'secagem', ordemPadrao: 50, responsavel: null },
  { nome: '1ª Queima', tipo: 'queima', ordemPadrao: 60, responsavel: 'Forno 1ª', aguardaCarga: true },
  { nome: 'Biscoito', tipo: 'estoque', ordemPadrao: 70, responsavel: null, estoqueIntermediario: true },
  { nome: 'Esmaltação', tipo: 'producao', ordemPadrao: 80, responsavel: 'Vera e Equipe', defineCor: true },
  { nome: '2ª Queima', tipo: 'queima', ordemPadrao: 90, responsavel: 'Forno 2ª', aguardaCarga: true },
  { nome: 'Pronto', tipo: 'final', ordemPadrao: 100, responsavel: null },
  // Destino terminal para peça com defeito pequeno que ainda vende. Sem ela, a
  // única saída era registrar como perda — e aí some estoque que existe e a
  // taxa de perda infla, contaminando o custo de todas as outras peças.
  { nome: 'Segunda qualidade', tipo: 'segunda', ordemPadrao: 110, responsavel: null },
]

// Roteiros nomeados — o fluxo muda por peça, conforme o prompt da Gabi
/*
 * Os três caminhos do ateliê. Acabamento saiu: é rápido demais para virar
 * parada no quadro, e etapa que ninguém registra só atrasa o lote na tela.
 *
 * Biscoito FICA. Não é passo de produção — é o estoque neutro onde a peça
 * espera a demanda dizer de que cor ela vai ser, e é dele que o planejamento
 * tira o biscoito para repartir entre as cores.
 */
const ROTEIRO_PADRAO = ['Oleiro', 'Secagem', '1ª Queima', 'Biscoito', 'Esmaltação', '2ª Queima', 'Pronto']
// xícara, bule e passador: o oleiro faz corpo e alças, a equipe cola, e só
// então seca — por isso a secagem é a TERCEIRA parada, e não a segunda
const ROTEIRO_COM_ALCA = ['Produção das alças', 'Colagem', 'Secagem', '1ª Queima', 'Biscoito', 'Esmaltação', '2ª Queima', 'Pronto']
// peça que nasce na mão da equipe: o lote já abre na coluna dela
const ROTEIRO_EQUIPE = ['Equipe Vera', 'Secagem', '1ª Queima', 'Biscoito', 'Esmaltação', '2ª Queima', 'Pronto']

/**
 * Peças. A COR NÃO faz parte do nome: no site é "Bowl Pistache", aqui é
 * peça `Bowl` com o esmalte `Pistache` disponível. É isso que permite o
 * planejamento dizer "esmaltar 20 peças Pistache" em vez de listar SKU a SKU.
 */
const PECAS = [
  { nome: 'Bowl', categoria: 'Bowls', roteiro: ROTEIRO_PADRAO, precoBase: 283, minimo: 12, minBiscoito: 20 },
  { nome: 'Bowl Recortado', categoria: 'Bowls', roteiro: ROTEIRO_PADRAO, precoBase: 159, minimo: 8, minBiscoito: 15 },
  { nome: 'Bule', categoria: 'Café', roteiro: ROTEIRO_COM_ALCA, precoBase: 218, minimo: 6, minBiscoito: 10 },
  { nome: 'Açucareiro', categoria: 'Café', roteiro: ROTEIRO_PADRAO, precoBase: 129, minimo: 8, minBiscoito: 12 },
  { nome: 'Conjunto Xícara e Passador', categoria: 'Café', roteiro: ROTEIRO_COM_ALCA, precoBase: 153, minimo: 8, minBiscoito: 12 },
  { nome: 'Copinho de Café', categoria: 'Café', roteiro: ROTEIRO_PADRAO, precoBase: 49, minimo: 24, minBiscoito: 40 },
  { nome: 'Xícara de Cafezinho', categoria: 'Café', roteiro: ROTEIRO_COM_ALCA, precoBase: 69, minimo: 24, minBiscoito: 40 },
  { nome: 'Xícara Bojudinha', categoria: 'Café', roteiro: ROTEIRO_COM_ALCA, precoBase: null, minimo: 20, minBiscoito: 30 },
  { nome: 'Xícara Andorinha', categoria: 'Café', roteiro: ROTEIRO_COM_ALCA, precoBase: null, minimo: 50, minBiscoito: 60 },
  { nome: 'Manteigueira Francesa', categoria: 'Manteigueira Francesa', roteiro: ROTEIRO_PADRAO, precoBase: 159, minimo: 10, minBiscoito: 16 },
  { nome: 'Prato de Refeição', categoria: 'Pratos', roteiro: ROTEIRO_PADRAO, precoBase: 143, minimo: 16, minBiscoito: 24 },
  { nome: 'Prato de Pão', categoria: 'Pratos', roteiro: ROTEIRO_PADRAO, precoBase: 107, minimo: 16, minBiscoito: 24 },
  { nome: 'Saladeira', categoria: 'Saladeiras', roteiro: ROTEIRO_PADRAO, precoBase: 239, minimo: 6, minBiscoito: 10 },
  { nome: 'Porta Guardanapo', categoria: 'Utilitários', roteiro: ROTEIRO_PADRAO, precoBase: 144, minimo: 10, minBiscoito: 16 },
  { nome: 'Tortinha', categoria: 'Utilitários', roteiro: ROTEIRO_EQUIPE, precoBase: null, minimo: 30, minBiscoito: 40 },
]

const MATERIAS_PRIMAS = [
  { nome: 'Argila de alta temperatura', tipo: 'argila', unidade: 'kg', estoqueMinimo: 50 },
  { nome: 'Esmalte Branco', tipo: 'esmalte', unidade: 'kg', estoqueMinimo: 5 },
  { nome: 'Esmalte Pistache', tipo: 'esmalte', unidade: 'kg', estoqueMinimo: 5 },
  { nome: 'Esmalte Azul Safira', tipo: 'esmalte', unidade: 'kg', estoqueMinimo: 5 },
  { nome: 'Caixa de papelão P', tipo: 'embalagem', unidade: 'un', estoqueMinimo: 30 },
]


/**
 * Canais de venda com as taxas vigentes em julho/2026, conferidas nas fontes
 * públicas dos marketplaces. Elas mudam sem aviso — tudo é editável pela tela,
 * e a data da última conferência fica na observação.
 *
 * Repare que as faixas importam: as peças da VF vão de R$49 a R$283 e
 * atravessam exatamente as fronteiras onde a regra muda. Um percentual único
 * erraria a conta justamente onde dói.
 */
const CANAIS = [
  {
    nome: 'Loja própria',
    comissaoPercentual: 0,
    taxaFixa: 0,
    freteSubsidiado: 25, // a loja anuncia frete grátis
    percentualAds: 0,
    percentualImposto: 6,
    percentualAntecipacao: 2,
    margemAlvoPercentual: 120,
    ordem: 0,
    observacao: 'Frete grátis anunciado no site entra como custo. Imposto e antecipação: confirmar com a contabilidade.',
    faixas: [],
  },
  {
    nome: 'Mercado Livre',
    comissaoPercentual: 13,
    taxaFixa: 0,
    freteSubsidiado: 0,
    percentualAds: 0,
    percentualImposto: 6,
    percentualAntecipacao: 0,
    margemAlvoPercentual: 120,
    ordem: 1,
    observacao:
      'Clássico ~11-14% por categoria (Premium sobe ~5 pontos). Custo fixo em itens abaixo de R$79. ' +
      'Acima de R$79 o frete grátis é obrigatório, com subsídio parcial conforme reputação. Conferido em jul/2026.',
    faixas: [
      { valorMinimo: 0, valorMaximo: 20, comissaoPercentual: 13, taxaFixa: 5.5, freteSubsidiado: 0 },
      { valorMinimo: 20.01, valorMaximo: 78.99, comissaoPercentual: 13, taxaFixa: 6, freteSubsidiado: 0 },
      { valorMinimo: 79, valorMaximo: null, comissaoPercentual: 13, taxaFixa: 0, freteSubsidiado: 18 },
    ],
  },
  {
    nome: 'Shopee',
    comissaoPercentual: 14,
    taxaFixa: 20,
    freteSubsidiado: 0,
    percentualAds: 0,
    percentualImposto: 6,
    percentualAntecipacao: 0,
    margemAlvoPercentual: 120,
    ordem: 2,
    observacao:
      'Comissão por faixa + taxa fixa por item, com Programa de Frete Grátis automático. ' +
      'Campanha em destaque acrescenta ~2,5%. Conferido em jul/2026 — reveja antes de publicar preço.',
    faixas: [
      { valorMinimo: 0, valorMaximo: 7.99, comissaoPercentual: 50, taxaFixa: 0, freteSubsidiado: 0 },
      { valorMinimo: 8, valorMaximo: 79.99, comissaoPercentual: 20, taxaFixa: 4, freteSubsidiado: 0 },
      { valorMinimo: 80, valorMaximo: 99.99, comissaoPercentual: 14, taxaFixa: 16, freteSubsidiado: 0 },
      { valorMinimo: 100, valorMaximo: 199.99, comissaoPercentual: 14, taxaFixa: 20, freteSubsidiado: 0 },
      { valorMinimo: 200, valorMaximo: null, comissaoPercentual: 14, taxaFixa: 26, freteSubsidiado: 0 },
    ],
  },
]

async function main() {
  console.log('▶ Semeando o Produção VF…')

  // ── Papéis ──────────────────────────────────────────────
  const permissoesGestao = { tudo: true }
  const permissoesProducao = { pecas: 'ler', producao: 'escrever', cadastros: 'ler', planejamento: 'ler' }
  const permissoesLeitura = { pecas: 'ler', producao: 'ler', cadastros: 'ler' }

  const gestao = await prisma.papel.upsert({
    where: { nome: 'gestao' },
    update: {},
    create: { nome: 'gestao', admin: true, protegido: true, permissoes: permissoesGestao },
  })
  await prisma.papel.upsert({
    where: { nome: 'producao' },
    update: {},
    create: { nome: 'producao', admin: false, protegido: true, permissoes: permissoesProducao },
  })
  await prisma.papel.upsert({
    where: { nome: 'leitura' },
    update: {},
    create: { nome: 'leitura', admin: false, protegido: true, permissoes: permissoesLeitura },
  })

  // ── Usuário inicial ─────────────────────────────────────
  const email = process.env.ADMIN_EMAIL ?? 'gabi@veraflesch.com.br'
  const senha = process.env.ADMIN_SENHA ?? 'ceramica123'
  await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: {
      nome: 'Gabi',
      email,
      senhaHash: await bcrypt.hash(senha, 10),
      papelId: gestao.id,
      precisaTrocarSenha: true,
    },
  })
  console.log(`  usuário inicial: ${email} / ${senha} (troca obrigatória no 1º login)`)

  // ── Categorias ──────────────────────────────────────────
  for (const [i, nome] of CATEGORIAS.entries()) {
    await prisma.categoria.upsert({ where: { nome }, update: {}, create: { nome, ordem: i } })
  }

  // ── Cores ───────────────────────────────────────────────
  for (const c of CORES) {
    await prisma.cor.upsert({
      where: { nome: c.nome },
      update: { hex: c.hex, malhado: c.malhado, observacao: c.observacao },
      create: { ...c, nomeBusca: normalizarBusca(c.nome) },
    })
  }

  /*
   * Responsáveis e etapas usam `update` PARCIAL, e não `update: {}`.
   *
   * O seed roda de novo em banco que já existe. Sobrescrever tudo apagaria os
   * ajustes que a Vera fez (nome de etapa, ordem, capacidade real do forno).
   * Mas campo NOVO, que nasceu nulo na migração, precisa ser preenchido uma vez
   * — senão o recurso fica inerte e ninguém entende por quê. A regra: só
   * preenche o que ainda não tem valor.
   */
  for (const r of RESPONSAVEIS) {
    const existente = await prisma.responsavel.findUnique({ where: { nome: r.nome } })
    if (!existente) {
      await prisma.responsavel.create({ data: { ...r, nomeBusca: normalizarBusca(r.nome) } })
      continue
    }
    const faltando: Record<string, unknown> = {}
    if (r.capacidadeCarga != null && existente.capacidadeCarga == null) {
      faltando.capacidadeCarga = r.capacidadeCarga
    }
    if (r.horasPorQueima != null && existente.horasPorQueima == null) {
      faltando.horasPorQueima = r.horasPorQueima
    }
    if (Object.keys(faltando).length > 0) {
      await prisma.responsavel.update({ where: { id: existente.id }, data: faltando })
      console.log(`  ajustado: ${r.nome} (${Object.keys(faltando).join(', ')})`)
    }
  }

  // ── Etapas ──────────────────────────────────────────────
  for (const e of ETAPAS) {
    const resp = e.responsavel ? await prisma.responsavel.findUnique({ where: { nome: e.responsavel } }) : null
    const existente = await prisma.etapa.findUnique({ where: { nome: e.nome } })
    if (!existente) {
      await prisma.etapa.create({
        data: {
          nome: e.nome,
          tipo: e.tipo,
          ordemPadrao: e.ordemPadrao,
          defineCor: e.defineCor ?? false,
          estoqueIntermediario: e.estoqueIntermediario ?? false,
          aguardaCarga: e.aguardaCarga ?? false,
          responsavelPadraoId: resp?.id ?? null,
        },
      })
      continue
    }
    // etapa de queima que veio da versão anterior não sabia esperar carga
    if (e.aguardaCarga && !existente.aguardaCarga) {
      await prisma.etapa.update({ where: { id: existente.id }, data: { aguardaCarga: true } })
      console.log(`  ajustado: etapa ${e.nome} agora aguarda carga do forno`)
    }
  }

  // ── Peças + roteiro + cores disponíveis ────────────────
  const todasCores = await prisma.cor.findMany()
  for (const p of PECAS) {
    const categoria = await prisma.categoria.findUniqueOrThrow({ where: { nome: p.categoria } })
    const primeiraEtapa = await prisma.etapa.findUniqueOrThrow({ where: { nome: p.roteiro[0] } })

    const peca = await prisma.peca.upsert({
      where: { nome: p.nome },
      update: {},
      create: {
        nome: p.nome,
        nomeBusca: normalizarBusca(p.nome),
        categoriaId: categoria.id,
        responsavelInicialId: primeiraEtapa.responsavelPadraoId,
        tempoMedioDias: 30,
        qtdMinimaDesejada: p.minimo,
        qtdMinimaBiscoito: p.minBiscoito,
        precoBase: p.precoBase,
      },
    })

    const jaTemRoteiro = await prisma.roteiroEtapa.count({ where: { pecaId: peca.id } })
    if (jaTemRoteiro === 0) {
      for (const [i, nomeEtapa] of p.roteiro.entries()) {
        const etapa = await prisma.etapa.findUniqueOrThrow({ where: { nome: nomeEtapa } })
        await prisma.roteiroEtapa.create({
          data: {
            pecaId: peca.id,
            etapaId: etapa.id,
            ordem: i + 1,
            responsavelId: etapa.responsavelPadraoId,
            diasEstimados: etapa.tipo === 'secagem' ? 5 : 1,
          },
        })
      }
    }

    const jaTemCor = await prisma.pecaCor.count({ where: { pecaId: peca.id } })
    if (jaTemCor === 0) {
      // toda peça começa aceitando todos os esmaltes; a Gabi ajusta pela tela
      for (const cor of todasCores) {
        await prisma.pecaCor.create({ data: { pecaId: peca.id, corId: cor.id } })
      }
    }
  }

  // ── Matérias-primas ─────────────────────────────────────
  for (const m of MATERIAS_PRIMAS) {
    await prisma.materiaPrima.upsert({
      where: { nome: m.nome },
      update: {},
      create: { ...m, nomeBusca: normalizarBusca(m.nome) },
    })
  }


  // ── Canais de venda ─────────────────────────────────────
  for (const c of CANAIS) {
    const { faixas, ...campos } = c
    const existente = await prisma.canalVenda.findUnique({ where: { nome: c.nome } })
    if (existente) continue
    await prisma.canalVenda.create({ data: { ...campos, faixas: { create: faixas } } })
  }

  const [pecas, cores, etapas] = await Promise.all([
    prisma.peca.count(),
    prisma.cor.count(),
    prisma.etapa.count(),
  ])
  console.log(`✅ Pronto — ${pecas} peças, ${cores} esmaltes, ${etapas} etapas.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
