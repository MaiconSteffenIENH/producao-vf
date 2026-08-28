import type { Prisma } from '@prisma/client'
import type { z } from 'zod'
import { prisma } from '../lib/prisma'
import { normalizarBusca } from '../lib/busca'
import { nomeDeCopia } from '../lib/nomes'
import { conferirFicha } from '../lib/ficha-tecnica'
import { conflito, invalido, naoEncontrado } from '../lib/erros'
import type { pecaSchema } from '../schemas'

type DadosPeca = z.infer<typeof pecaSchema>

const incluirTudo = {
  categoria: true,
  responsavelInicial: { select: { id: true, nome: true, cor: true, tipo: true } },
  roteiro: {
    orderBy: { ordem: 'asc' as const },
    include: {
      etapa: { select: { id: true, nome: true, tipo: true, defineCor: true, estoqueIntermediario: true } },
      responsavel: { select: { id: true, nome: true, cor: true } },
    },
  },
  cores: {
    include: { cor: { select: { id: true, nome: true, hex: true, malhado: true, amostraUrl: true, ativo: true } } },
  },
  argila: { select: { id: true, nome: true, unidade: true, estoqueAtual: true } },
  insumos: {
    include: {
      materiaPrima: { select: { id: true, nome: true, tipo: true, unidade: true, estoqueAtual: true } },
      etapa: { select: { id: true, nome: true } },
      cor: { select: { id: true, nome: true, hex: true } },
    },
  },
}

export async function listarPecas(filtros: { busca?: string; categoriaId?: string; ativo?: string }) {
  const busca = filtros.busca ? normalizarBusca(filtros.busca) : ''
  return prisma.peca.findMany({
    where: {
      ...(busca ? { nomeBusca: { contains: busca } } : {}),
      ...(filtros.categoriaId ? { categoriaId: filtros.categoriaId } : {}),
      ...(filtros.ativo === 'true' ? { ativo: true } : {}),
      ...(filtros.ativo === 'false' ? { ativo: false } : {}),
    },
    orderBy: { nome: 'asc' },
    include: incluirTudo,
  })
}

export async function obterPeca(id: string) {
  const peca = await prisma.peca.findUnique({ where: { id }, include: incluirTudo })
  if (!peca) throw naoEncontrado('Peça')
  return peca
}

/**
 * Limpa o que veio do formulário dinâmico: linha em branco vira nada, etapa
 * repetida some (a ordem é recalculada a partir da posição no array). O schema
 * zod é leniente de propósito para o service poder limpar em vez de estourar 400.
 */
function normalizarRoteiro(roteiro: DadosPeca['roteiro']) {
  const vistos = new Set<string>()
  return roteiro
    .filter((r) => r.etapaId && !vistos.has(r.etapaId) && vistos.add(r.etapaId))
    .map((r, i) => ({
      etapaId: r.etapaId,
      ordem: i + 1,
      responsavelId: r.responsavelId || null,
      diasEstimados: r.diasEstimados ?? 1,
    }))
}

function normalizarCores(cores: DadosPeca['cores']) {
  const vistos = new Set<string>()
  return cores
    .filter((c) => c.corId && !vistos.has(c.corId) && vistos.add(c.corId))
    .map((c) => ({ corId: c.corId, qtdMinimaDesejada: c.qtdMinimaDesejada ?? 0 }))
}

/*
 * Os insumos que a peça consome — a argila entre eles.
 *
 * A chave de unicidade no banco é (peça, matéria-prima, cor): a mesma peça pode
 * gastar dois esmaltes DIFERENTES em cores diferentes, mas não pode gastar a
 * mesma argila duas vezes. Deduplicar por essa chave composta aqui evita que o
 * formulário estoure a violação de índice — e devolva um erro do Postgres em
 * inglês onde cabia simplesmente descartar a linha repetida.
 *
 * Insumo sem quantidade é linha esquecida no formulário, não consumo zero: ele
 * inflaria o cadastro e não mudaria conta nenhuma, então some.
 */
function normalizarInsumos(insumos: DadosPeca['insumos']) {
  // `undefined` é "não mexa" e precisa atravessar sem virar lista vazia, senão
  // a edição feita de uma tela antiga apagaria a argila cadastrada
  if (insumos === undefined) return null
  const vistos = new Set<string>()
  return insumos
    .filter((i) => i.materiaPrimaId && (i.quantidadePorPeca ?? 0) > 0)
    .filter((i) => {
      const chave = `${i.materiaPrimaId}|${i.corId || ''}`
      if (vistos.has(chave)) return false
      vistos.add(chave)
      return true
    })
    .map((i) => ({
      materiaPrimaId: i.materiaPrimaId,
      quantidadePorPeca: i.quantidadePorPeca,
      etapaId: i.etapaId || null,
      corId: i.corId || null,
    }))
}

async function validarReferencias(roteiro: ReturnType<typeof normalizarRoteiro>, cores: ReturnType<typeof normalizarCores>) {
  if (roteiro.length > 0) {
    const existentes = await prisma.etapa.count({ where: { id: { in: roteiro.map((r) => r.etapaId) } } })
    if (existentes !== roteiro.length) throw invalido('Alguma etapa do roteiro não existe mais. Recarregue a tela.')
  }
  if (cores.length > 0) {
    const existentes = await prisma.cor.count({ where: { id: { in: cores.map((c) => c.corId) } } })
    if (existentes !== cores.length) throw invalido('Algum esmalte selecionado não existe mais. Recarregue a tela.')
  }
}

async function validarInsumos(insumos: ReturnType<typeof normalizarInsumos>) {
  if (!insumos || insumos.length === 0) return
  const ids = [...new Set(insumos.map((i) => i.materiaPrimaId))]
  const existentes = await prisma.materiaPrima.count({ where: { id: { in: ids } } })
  if (existentes !== ids.length) {
    throw invalido('Alguma matéria-prima selecionada não existe mais. Recarregue a tela.')
  }
  const etapas = [...new Set(insumos.map((i) => i.etapaId).filter((e): e is string => Boolean(e)))]
  if (etapas.length > 0) {
    const achadas = await prisma.etapa.count({ where: { id: { in: etapas } } })
    if (achadas !== etapas.length) throw invalido('Alguma etapa do consumo não existe mais. Recarregue a tela.')
  }
}

/**
 * A ficha técnica é coerente?
 *
 * A conta mora em `lib/ficha-tecnica.ts`, sem Prisma, e é chamada aqui. O 422
 * carrega a lista inteira de problemas: quem cadastra quer saber tudo o que
 * falta de uma vez, e não descobrir um erro por tentativa de salvar.
 */
/**
 * A argila escolhida existe e é mesmo argila?
 *
 * O tipo é conferido de propósito: a tela só oferece matéria-prima do tipo
 * `argila`, mas o campo aceita qualquer id, e uma peça "feita de caixa de
 * papelão" faria o planejamento mandar comprar embalagem pelo peso do barro.
 */
async function validarArgila(argilaId: string | null | undefined) {
  if (!argilaId) return
  const mp = await prisma.materiaPrima.findUnique({
    where: { id: argilaId },
    select: { tipo: true, nome: true },
  })
  if (!mp) throw invalido('A argila escolhida não existe mais. Recarregue a tela.')
  if (mp.tipo !== 'argila') {
    throw invalido(`"${mp.nome}" não é uma argila. Escolha uma matéria-prima do tipo argila.`)
  }
}

function validarFicha(dados: DadosPeca) {
  const problemas = conferirFicha({
    alturaCm: dados.alturaCm ?? null,
    larguraCm: dados.larguraCm ?? null,
    capacidadeMl: dados.capacidadeMl ?? null,
    pesoCruG: dados.pesoCruG ?? null,
    momento: dados.medidasMomento ?? null,
    toleranciaPct: dados.medidaToleranciaPct ?? null,
  })
  if (problemas.length > 0) {
    throw invalido(problemas.map((p) => p.mensagem).join(' '), problemas)
  }
}

/*
 * Os campos da ficha técnica, do jeito que vão para o banco.
 *
 * NADA de `?? null` aqui, pelo mesmo motivo do `precoBase` logo abaixo: o app
 * fica em cache, e depois de publicar um celular com a tela ANTIGA continua
 * editando peça sem mandar estes campos. Com o `?? null`, essa edição apagaria
 * as medidas que alguém acabou de cadastrar.
 *
 * `undefined` faz o Prisma não tocar na coluna — "não mexa".
 * `null` explícito apaga — "limpei o campo na tela".
 * São intenções diferentes e precisam continuar diferentes até o banco.
 */
const fichaDe = (dados: DadosPeca) => ({
  alturaCm: dados.alturaCm,
  larguraCm: dados.larguraCm,
  capacidadeMl: dados.capacidadeMl,
  pesoCruG: dados.pesoCruG,
  medidasMomento: dados.medidasMomento,
  medidaToleranciaPct: dados.medidaToleranciaPct,
  // string vazia do select vira nulo; ausente continua ausente
  argilaId: dados.argilaId === undefined ? undefined : dados.argilaId || null,
})

export async function criarPeca(dados: DadosPeca) {
  const roteiro = normalizarRoteiro(dados.roteiro)
  const cores = normalizarCores(dados.cores)
  const insumos = normalizarInsumos(dados.insumos)
  await validarReferencias(roteiro, cores)
  await validarInsumos(insumos)
  await validarArgila(dados.argilaId)
  validarFicha(dados)

  const peca = await prisma.peca.create({
    data: {
      nome: dados.nome,
      nomeBusca: normalizarBusca(dados.nome),
      categoriaId: dados.categoriaId,
      responsavelInicialId: dados.responsavelInicialId || null,
      tempoMedioDias: dados.tempoMedioDias,
      qtdMinimaDesejada: dados.qtdMinimaDesejada,
      qtdMinimaBiscoito: dados.qtdMinimaBiscoito,
      precoBase: dados.precoBase ?? null,
      ...fichaDe(dados),
      observacao: dados.observacao || null,
      ativo: dados.ativo,
      roteiro: { create: roteiro },
      cores: { create: cores },
      insumos: { create: insumos ?? [] },
    },
    include: incluirTudo,
  })
  return peca
}

export async function atualizarPeca(id: string, dados: DadosPeca) {
  const roteiro = normalizarRoteiro(dados.roteiro)
  const cores = normalizarCores(dados.cores)
  const insumos = normalizarInsumos(dados.insumos)
  await validarReferencias(roteiro, cores)
  await validarInsumos(insumos)
  await validarArgila(dados.argilaId)
  validarFicha(dados)

  // Roteiro, cores e insumos são substituídos inteiros: é a única forma de
  // reordenar sem colidir com o @@unique([pecaId, ordem]) no meio da
  // atualização, e a mesma razão vale para a chave (peça, insumo, cor).
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.roteiroEtapa.deleteMany({ where: { pecaId: id } })
    await tx.pecaCor.deleteMany({ where: { pecaId: id } })
    // só apaga os insumos quando a tela de fato mandou a lista; ver o comentário
    // em `normalizarInsumos` sobre a versão antiga do app em cache
    if (insumos) await tx.pecaInsumo.deleteMany({ where: { pecaId: id } })
    return tx.peca.update({
      where: { id },
      data: {
        nome: dados.nome,
        nomeBusca: normalizarBusca(dados.nome),
        categoriaId: dados.categoriaId,
        responsavelInicialId: dados.responsavelInicialId || null,
        tempoMedioDias: dados.tempoMedioDias,
        qtdMinimaDesejada: dados.qtdMinimaDesejada,
        /*
         * Também NÃO É `?? 0`, pelo mesmo motivo do preço logo abaixo. O
         * mínimo em biscoito saiu do cadastro e passou a ser editado na tela
         * de Estoque de biscoito; com um zero inventado aqui, renomear uma
         * peça apagaria o mínimo dela e o alerta de pulmão se desligaria
         * sozinho, sem ninguém ver.
         */
        qtdMinimaBiscoito: dados.qtdMinimaBiscoito,
        /*
         * NÃO É `?? null`. O cadastro de peça deixou de ter campo de preço, e
         * com ele fora do corpo `dados.precoBase` chega `undefined`. Com o
         * `?? null`, toda edição de peça — trocar o nome, mexer no roteiro —
         * APAGARIA o preço definido na tela de Preços, em silêncio. `undefined`
         * faz o Prisma não tocar na coluna, que é o comportamento certo para
         * um campo que esta tela não edita mais.
         */
        precoBase: dados.precoBase,
        ...fichaDe(dados),
        observacao: dados.observacao || null,
        ativo: dados.ativo,
        roteiro: { create: roteiro },
        cores: { create: cores },
        ...(insumos ? { insumos: { create: insumos } } : {}),
      },
      include: incluirTudo,
    })
  })
}

export async function excluirPeca(id: string) {
  // roteiro e cores caem por cascade; a FK dos lotes impede apagar peça
  // que já produziu — nesse caso o certo é desativar
  await prisma.peca.delete({ where: { id } })
}

/**
 * O nome que a tela oferece ao duplicar, antes de duplicar de fato.
 *
 * Existe separado porque o modal precisa abrir com o campo já preenchido: a
 * mesma conta feita na hora de gravar, só que sem gravar nada.
 */
export async function sugerirNomeDeCopia(id: string) {
  const original = await prisma.peca.findUnique({ where: { id }, select: { nome: true } })
  if (!original) throw naoEncontrado('Peça')
  const existentes = await prisma.peca.findMany({ select: { nome: true } })
  return { nome: nomeDeCopia(original.nome, existentes.map((p: { nome: string }) => p.nome)) }
}

/**
 * Duplicar acelera o cadastro: as peças da casa compartilham quase todo o
 * roteiro.
 *
 * DUAS COISAS QUE A PRIMEIRA VERSÃO ERRAVA.
 *
 * 1. O NOME ERA IMPOSTO. "BOWL (CÓPIA)" nunca é o nome que se quer, então toda
 *    duplicação virava duas operações: copiar e depois renomear. Agora o nome
 *    chega de fora; quando não chega, o sugerido continua valendo.
 *
 * 2. O CUSTO NÃO VINHA JUNTO. A cópia herdava roteiro e esmaltes e nascia sem
 *    `CustoPeca` — e a tela de Preços passava a mostrar uma peça sem custo, que
 *    parece peça nova ainda não precificada. Só que a cópia é a MESMA argila,
 *    o mesmo esmalte e a mesma queima: é justamente o caso em que o custo é
 *    reaproveitável. Preço praticado por canal (`PrecoCanal`) NÃO vem junto de
 *    propósito — aquilo é fato de venda da peça original, não característica
 *    de produção.
 *
 * Tudo numa transação: peça sem o custo que deveria ter acompanhado é pior do
 * que duplicação nenhuma, porque ninguém desconfia dela.
 */
export async function duplicarPeca(id: string, nomePedido?: string) {
  const original = await obterPeca(id)
  const custo = await prisma.custoPeca.findUnique({ where: { pecaId: id } })

  let nome = nomePedido?.trim() ?? ''
  if (!nome) {
    const existentes = await prisma.peca.findMany({ select: { nome: true } })
    nome = nomeDeCopia(original.nome, existentes.map((p: { nome: string }) => p.nome))
  }

  // `Peca.nome` é único: conferir antes troca uma violação de índice em inglês
  // por uma frase que diz o que fazer
  const ocupado = await prisma.peca.findUnique({ where: { nome }, select: { id: true } })
  if (ocupado) throw conflito(`Já existe uma peça chamada "${nome}". Escolha outro nome para a cópia.`)

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const copia = await tx.peca.create({
      data: {
        nome,
        nomeBusca: normalizarBusca(nome),
        categoriaId: original.categoriaId,
        responsavelInicialId: original.responsavelInicialId,
        tempoMedioDias: original.tempoMedioDias,
        qtdMinimaDesejada: original.qtdMinimaDesejada,
        qtdMinimaBiscoito: original.qtdMinimaBiscoito,
        precoBase: original.precoBase,
        // a ficha técnica vem junto: a cópia é a mesma peça com outro nome, e
        // remedir tudo de novo seria o oposto do motivo de duplicar
        alturaCm: original.alturaCm,
        larguraCm: original.larguraCm,
        capacidadeMl: original.capacidadeMl,
        pesoCruG: original.pesoCruG,
        medidasMomento: original.medidasMomento,
        medidaToleranciaPct: original.medidaToleranciaPct,
        argilaId: original.argilaId,
        observacao: original.observacao,
        ativo: false, // nasce inativa: obriga a revisar antes de entrar no planejamento
        roteiro: {
          create: original.roteiro.map(
            (r: { etapaId: string; ordem: number; responsavelId: string | null; diasEstimados: number }) => ({
              etapaId: r.etapaId,
              ordem: r.ordem,
              responsavelId: r.responsavelId,
              diasEstimados: r.diasEstimados,
            }),
          ),
        },
        cores: {
          create: original.cores.map((c: { corId: string; qtdMinimaDesejada: number }) => ({
            corId: c.corId,
            qtdMinimaDesejada: c.qtdMinimaDesejada,
          })),
        },
        // o consumo de insumo também: mesma argila, mesmo esmalte, mesma queima
        insumos: {
          create: original.insumos.map(
            (i: { materiaPrimaId: string; quantidadePorPeca: unknown; etapaId: string | null; corId: string | null }) => ({
              materiaPrimaId: i.materiaPrimaId,
              quantidadePorPeca: i.quantidadePorPeca as never,
              etapaId: i.etapaId,
              corId: i.corId,
            }),
          ),
        },
      },
      include: incluirTudo,
    })

    if (custo) {
      await tx.custoPeca.create({
        data: {
          pecaId: copia.id,
          custoArgila: custo.custoArgila,
          custoEsmalte: custo.custoEsmalte,
          custoQueima: custo.custoQueima,
          custoEmbalagem: custo.custoEmbalagem,
          minutosMaoDeObra: custo.minutosMaoDeObra,
          custoHoraMaoDeObra: custo.custoHoraMaoDeObra,
          outrosCustos: custo.outrosCustos,
          perdaEstimadaPercentual: custo.perdaEstimadaPercentual,
        },
      })
    }

    return copia
  })
}

/**
 * O mínimo em biscoito, gravado de onde ele é decidido.
 *
 * Ele saiu do cadastro de peça: quem cadastra é a Gabi, e "quanto pulmão esta
 * peça precisa" não é pergunta de cadastro — é decisão de estoque, tomada
 * olhando o que está parado e o que está vendendo. Por isso a edição vive na
 * tela de Estoque de biscoito, e por isso ela é uma rota própria: um PUT da
 * peça inteira, disparado dali, arrastaria roteiro e esmaltes junto.
 *
 * A rota fica sob `/pecas`, e não sob `/estoque`, por causa do guarda de
 * módulos: ele decide pelo PRIMEIRO segmento do caminho, e o dono da escrita
 * em `estoque` é `estoque-prontas`. Pendurada ali, ela daria 403 exatamente em
 * quem só tem o módulo de biscoito — a pessoa que usa a tela.
 */
export async function definirMinimoBiscoito(id: string, qtdMinimaBiscoito: number) {
  const peca = await prisma.peca.findUnique({ where: { id }, select: { id: true } })
  if (!peca) throw naoEncontrado('Peça')
  return prisma.peca.update({
    where: { id },
    data: { qtdMinimaBiscoito },
    select: { id: true, nome: true, qtdMinimaBiscoito: true },
  })
}
