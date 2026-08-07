import { prisma } from "../lib/prisma";
import {
  conflito,
  invalido,
  naoEncontrado,
  regraDeNegocio,
} from "../lib/erros";
import {
  montarCarga,
  recomendarQueima,
  situacaoDaCarga,
  type LoteEsperando,
} from "../lib/queima";
import {
  chaveDaConclusao,
  planejarConclusao,
  QuebraInvalida,
  type EstadoDoLote,
  type ItemDaCarga,
} from "../lib/conclusao-queima";
import { avancarLote, registrarPerda, saldosPorLote } from "./lote.service";
import { proximoCodigo } from "./contador.service";
import type { Sessao } from "../lib/token";

/*
 * O FORNO como carga, não como etapa.
 *
 * A fila de cada queima é derivada, como todo o resto do sistema: são os
 * saldos parados nas etapas marcadas com `aguardaCarga`. Ninguém digita "tem 68
 * peças esperando" — isso sai do livro-razão.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Biscoito ou esmalte?
 *
 * Não dá para olhar o nome ("1ª Queima" pode ser renomeada) nem cravar número
 * de ordem. O que define é a POSIÇÃO em relação à etapa que decide a cor: antes
 * dela o lote é biscoito neutro, depois já está esmaltado. Essa é a regra que
 * o ateliê usa de verdade.
 */
function tipoDaEtapa(
  etapa: { ordemPadrao: number },
  ordemDaCor: number,
): "biscoito" | "esmalte" {
  return etapa.ordemPadrao < ordemDaCor ? "biscoito" : "esmalte";
}

export type FilaDeQueima = {
  tipo: "biscoito" | "esmalte";
  etapaIds: string[];
  situacao: ReturnType<typeof situacaoDaCarga>;
  recomendacao: ReturnType<typeof recomendarQueima>;
  lotes: LoteEsperando[];
};

/**
 * Como está a fila de cada tipo de queima agora.
 *
 * Base da sugestão que nenhum ateliê calcula de cabeça: "faltam 12 para fechar
 * a carga, e essas 12 adiantam as outras 68".
 */
type EtapaCrua = {
  id: string;
  nome: string;
  defineCor: boolean;
  ordemPadrao: number;
  capacidadeCarga: number | null;
};

export async function filaDasQueimas(
  agora = new Date(),
): Promise<FilaDeQueima[]> {
  const [etapas, etapaDaCor] = await Promise.all([
    // a capacidade vem DA ETAPA: o ateliê tem um forno para a 1ª queima e
    // outro para a 2ª, e eles não têm o mesmo tamanho
    prisma.etapa.findMany({
      where: { aguardaCarga: true, ativo: true },
      select: {
        id: true,
        nome: true,
        defineCor: true,
        ordemPadrao: true,
        capacidadeCarga: true,
      },
    }),
    prisma.etapa.findFirst({ where: { defineCor: true, ativo: true } }),
  ]);
  if (etapas.length === 0) return [];

  const ordemDaCor =
    (etapaDaCor as { ordemPadrao: number } | null)?.ordemPadrao ??
    Number.MAX_SAFE_INTEGER;

  const saldos = await saldosPorLote();
  const listaEtapas = etapas as EtapaCrua[];
  const etapaIds = new Set(listaEtapas.map((e) => e.id));

  const lotes = await prisma.lote.findMany({
    where: { canceladoEm: null, concluidoEm: null },
    include: { peca: { select: { nome: true } } },
  });

  // último movimento de cada lote: é dele que sai "há quantos dias está parado"
  const ultimos = await prisma.movimentoLote.groupBy({
    by: ["loteId"],
    _max: { criadoEm: true },
  });
  const paradoDesde = new Map<string, Date | null>(
    (ultimos as { loteId: string; _max: { criadoEm: Date | null } }[]).map(
      (u) => [u.loteId, u._max.criadoEm],
    ),
  );

  const porTipo = new Map<
    "biscoito" | "esmalte",
    {
      etapaIds: string[];
      lotes: LoteEsperando[];
      capacidade: number;
      forno: string | null;
    }
  >();
  for (const etapa of listaEtapas) {
    const tipo = tipoDaEtapa(etapa, ordemDaCor);
    if (!porTipo.has(tipo)) {
      porTipo.set(tipo, {
        etapaIds: [],
        lotes: [],
        capacidade: 0,
        forno: null,
      });
    }
    const grupo = porTipo.get(tipo)!;
    grupo.etapaIds.push(etapa.id);
    // a maior capacidade entre as etapas do mesmo tipo — normalmente é uma só
    const cap = etapa.capacidadeCarga ?? 0;
    if (cap > grupo.capacidade) {
      grupo.capacidade = cap;
      grupo.forno = etapa.nome;
    }
  }

  for (const lote of lotes as {
    id: string;
    codigo: string;
    iniciadoEm: Date;
    peca: { nome: string };
  }[]) {
    const doLote = saldos.get(lote.id);
    if (!doLote) continue;
    for (const [etapaId, quantidade] of doLote) {
      if (!etapaIds.has(etapaId) || quantidade <= 0) continue;
      const etapa = listaEtapas.find((e) => e.id === etapaId)!;
      const tipo = tipoDaEtapa(etapa, ordemDaCor);
      const desde = paradoDesde.get(lote.id) ?? lote.iniciadoEm;
      porTipo.get(tipo)!.lotes.push({
        loteId: lote.id,
        codigo: lote.codigo,
        pecaNome: lote.peca.nome,
        quantidade,
        etapaId,
        diasParado: Math.max(
          0,
          Math.floor((agora.getTime() - desde.getTime()) / DIA_MS),
        ),
      });
    }
  }

  return (
    [...porTipo.entries()]
      // sem capacidade cadastrada não há como falar de carga; melhor calar do
      // que chutar um número que a Vera vai tomar por verdade
      .filter(([, dados]) => dados.capacidade > 0)
      .map(([tipo, dados]) => {
        const situacao = situacaoDaCarga(dados.lotes, dados.capacidade);
        return {
          tipo,
          etapaIds: dados.etapaIds,
          situacao,
          recomendacao: recomendarQueima(situacao),
          lotes: dados.lotes.sort((a, b) => b.diasParado - a.diasParado),
        };
      })
  );
}

export async function listarQueimas(filtros: { status?: string } = {}) {
  return prisma.queima.findMany({
    where: filtros.status ? { status: filtros.status } : {},
    include: {
      forno: { select: { id: true, nome: true } },
      itens: {
        include: {
          lote: {
            include: {
              peca: { select: { nome: true } },
              cor: { select: { nome: true, hex: true } },
            },
          },
        },
      },
    },
    orderBy: [{ criadoEm: "desc" }],
    take: 60,
  });
}

/**
 * Abre uma fornada já montada com o que está esperando.
 *
 * A carga entra por ordem de espera — quem está parado há mais tempo primeiro.
 * Sem essa regra, um lote pequeno pode ficar eternamente fora porque sempre
 * chega um maior.
 */
export async function abrirQueima(dados: {
  tipo: "biscoito" | "esmalte";
  previstaPara?: string | null;
  observacao?: string | null;
  agora?: Date;
}) {
  const agora = dados.agora ?? new Date();
  const filas = await filaDasQueimas(agora);
  const fila = filas.find((f) => f.tipo === dados.tipo);
  if (!fila)
    throw regraDeNegocio("Não há etapa de queima deste tipo configurada.");
  if (fila.lotes.length === 0)
    throw regraDeNegocio("Não há nada esperando esta queima.");

  // o forno é o da PRIMEIRA etapa desta fila — é dela que sai a capacidade
  const etapa = await prisma.etapa.findUnique({
    where: { id: fila.etapaIds[0] },
    select: { id: true, nome: true, capacidadeCarga: true },
  });
  const capacidade = etapa?.capacidadeCarga ?? 0;
  if (capacidade <= 0) {
    throw regraDeNegocio(
      `Preencha "Capacidade por carga" na etapa ${etapa?.nome ?? "de queima"}, em Etapas, ` +
        "antes de abrir uma fornada.",
    );
  }

  const carga = montarCarga(fila.lotes, capacidade);
  const codigo = await proximoCodigo("queima", "Q");

  return prisma.queima.create({
    data: {
      codigo,
      tipo: dados.tipo,
      status: "carregando",
      // o forno deixou de ser um responsável: quem executa a carga é a etapa
      fornoId: null,
      capacidade,
      previstaPara: dados.previstaPara ? new Date(dados.previstaPara) : null,
      observacao: dados.observacao ?? null,
      // a etapa de onde a carga saiu: sem ela, concluir precisaria adivinhar
      itens: {
        create: carga.map((c) => ({
          loteId: c.loteId,
          quantidade: c.quantidade,
          etapaId: c.etapaId,
        })),
      },
    },
    include: { itens: true },
  });
}

export async function atualizarStatusQueima(
  id: string,
  status: string,
  agora = new Date(),
) {
  const queima = await prisma.queima.findUnique({ where: { id } });
  if (!queima) throw naoEncontrado("Queima");

  const permitidos = [
    "planejada",
    "carregando",
    "queimando",
    "concluida",
    "cancelada",
  ];
  if (!permitidos.includes(status))
    throw regraDeNegocio(`Status inválido: ${status}`);

  if (status === "concluida") {
    throw regraDeNegocio(
      "Concluir a fornada move as peças, então passa pela tela de conclusão — " +
        "é lá que se informa o que quebrou no forno.",
    );
  }

  // 'concluida' não chega aqui — quem fecha a fornada é `concluirQueima`
  return prisma.queima.update({
    where: { id },
    data: {
      status,
      iniciadaEm: status === "queimando" ? agora : queima.iniciadaEm,
    },
  });
}

/*
 * ───────────────────────── CONCLUIR A FORNADA ─────────────────────────
 *
 * Antes, concluir só trocava a palavra na tela: as peças continuavam paradas na
 * etapa de queima e quem operou o forno tinha de repetir tudo no quadro, lote a
 * lote. Agora concluir É o movimento — o que quebrou vira perda, o resto avança.
 *
 * ── POR QUE NÃO É UMA TRANSAÇÃO SÓ ──
 *
 * Cada perda e cada avanço passa pelos serviços que já existem (`registrarPerda`,
 * `avancarLote`), e cada um abre a sua transação. Reescrever o livro-razão aqui
 * dentro para caber tudo num BEGIN só duplicaria as regras de saldo, cor e
 * divisão de lote — e é justamente aí que mora o estrago silencioso.
 *
 * O que garante a segurança é a CHAVE DE IDEMPOTÊNCIA: cada movimento tem um
 * nome fixo derivado da fornada e do lote. Se a conexão cair no meio do quinto
 * lote, apertar "Concluir" de novo repete os quatro primeiros sem gravá-los
 * outra vez e continua de onde parou. É o mesmo mecanismo da fila offline do
 * celular, que já roda em produção.
 *
 * O status só vira "concluida" DEPOIS que todos os movimentos passaram. Fornada
 * marcada como concluída com peça ainda dentro seria pior do que não marcar.
 */

/**
 * Achar em qual etapa de queima o lote está e para onde ele vai depois.
 *
 * `etapaGravada` é a etapa que a fornada registrou quando foi aberta, e ela
 * ganha de tudo. O caminho de procurar no roteiro só existe para fornada
 * aberta antes dessa coluna existir — e ele ADIVINHA: com duas paradas de
 * forno do mesmo tipo no roteiro, pode escolher a pilha errada.
 */
function estadoDoLote(
  roteiro: readonly LinhaDeRoteiro[],
  saldoPorEtapa: ReadonlyMap<string, number> | undefined,
  tipo: "biscoito" | "esmalte",
  ordemDaCor: number,
  etapaGravada: string | null,
): EstadoDoLote | null {
  const naGravada = etapaGravada
    ? roteiro.find((r) => r.etapaId === etapaGravada)
    : undefined;

  const candidatas = roteiro.filter(
    (r) =>
      r.etapa.aguardaCarga &&
      (r.etapa.ordemPadrao < ordemDaCor ? "biscoito" : "esmalte") === tipo,
  );

  // a etapa onde ainda há peça parada; se não houver, a primeira serve para o
  // planejador dizer "já saiu daqui" em vez de estourar
  const escolhida =
    naGravada ??
    candidatas.find((r) => (saldoPorEtapa?.get(r.etapaId) ?? 0) > 0) ??
    candidatas[0];
  if (!escolhida) return null;

  const posicao = roteiro.findIndex((r) => r.etapaId === escolhida.etapaId);
  const proxima = roteiro[posicao + 1];

  return {
    saldo: saldoPorEtapa?.get(escolhida.etapaId) ?? 0,
    etapaId: escolhida.etapaId,
    proximaEtapaId: proxima?.etapaId ?? null,
    proximaDefineCor: proxima?.etapa.defineCor ?? false,
  };
}

export type QuebraInformada = {
  loteId: string;
  quantidade: number;
  motivo?: string | null;
};

/*
 * As formas das duas consultas, escritas à mão.
 *
 * O Prisma Client é gerado, então em tese o tipo viria dele. Só que o contêiner
 * onde estes serviços são conferidos não consegue baixar o motor do Prisma, e
 * lá o cliente é um esboço que devolve `any` — o que faz `noImplicitAny`
 * reclamar de todo `.map((i) => …)` daqui. Declarar a forma esperada resolve
 * nos dois lugares e, de quebra, deixa escrito o que estas consultas trazem.
 */
type ItemComLote = {
  loteId: string;
  quantidade: number;
  /** nulo em fornada aberta antes desta coluna existir */
  etapaId: string | null;
  lote: {
    id: string;
    codigo: string;
    pecaId: string;
    corId: string | null;
    peca: { nome: string };
  };
};
type LinhaDeRoteiro = {
  pecaId: string;
  etapaId: string;
  etapa: {
    nome?: string;
    aguardaCarga: boolean;
    ordemPadrao: number;
    defineCor: boolean;
  };
};

export async function concluirQueima(
  id: string,
  quebrasInformadas: readonly QuebraInformada[],
  sessao: Sessao,
  agora = new Date(),
) {
  const queima = await prisma.queima.findUnique({
    where: { id },
    include: {
      itens: {
        include: {
          lote: {
            select: {
              id: true,
              codigo: true,
              pecaId: true,
              corId: true,
              peca: { select: { nome: true } },
            },
          },
        },
      },
    },
  });
  if (!queima) throw naoEncontrado("Queima");
  if (queima.status === "concluida")
    throw regraDeNegocio("Esta fornada já foi concluída.");
  if (queima.status === "cancelada")
    throw regraDeNegocio("Esta fornada foi cancelada.");

  const tipo = queima.tipo === "biscoito" ? "biscoito" : "esmalte";
  const itensDaQueima = queima.itens as ItemComLote[];
  const itens: ItemDaCarga[] = itensDaQueima.map((i) => ({
    loteId: i.loteId,
    codigo: i.lote.codigo,
    pecaNome: i.lote.peca.nome,
    quantidade: i.quantidade,
  }));

  const etapaDaCor = await prisma.etapa.findFirst({
    where: { defineCor: true, ativo: true },
  });
  const ordemDaCor =
    (etapaDaCor as { ordemPadrao: number } | null)?.ordemPadrao ??
    Number.MAX_SAFE_INTEGER;

  const pecaIds = [...new Set(itensDaQueima.map((i) => i.lote.pecaId))];
  const roteiros = (await prisma.roteiroEtapa.findMany({
    where: { pecaId: { in: pecaIds } },
    orderBy: { ordem: "asc" },
    select: {
      pecaId: true,
      etapaId: true,
      etapa: {
        select: { aguardaCarga: true, ordemPadrao: true, defineCor: true },
      },
    },
  })) as LinhaDeRoteiro[];
  const roteiroPorPeca = new Map<string, LinhaDeRoteiro[]>();
  for (const linha of roteiros) {
    const lista = roteiroPorPeca.get(linha.pecaId) ?? [];
    lista.push(linha);
    roteiroPorPeca.set(linha.pecaId, lista);
  }

  const saldos = await saldosPorLote(itens.map((i) => i.loteId));

  /*
   * O QUE JÁ FOI GRAVADO NUMA TENTATIVA ANTERIOR.
   *
   * A conclusão pode ter morrido no meio — sinal caindo, erro de cadastro num
   * lote adiante. A perda daquele lote ficou no livro-razão e o saldo da etapa
   * já caiu. Sem ler isto de volta, a segunda tentativa descontaria a mesma
   * quebra duas vezes e deixaria peça encalhada na queima.
   */
  const jaGravados = (await prisma.movimentoLote.findMany({
    where: {
      chaveIdempotencia: {
        in: itensDaQueima.map((i) =>
          chaveDaConclusao(queima.id, i.loteId, "perda"),
        ),
      },
    },
    select: { loteId: true, quantidade: true },
  })) as { loteId: string; quantidade: number }[];
  const perdaJaGravada = new Map(
    jaGravados.map((m) => [m.loteId, m.quantidade]),
  );

  const estados = new Map<string, EstadoDoLote>();
  for (const item of itensDaQueima) {
    const roteiro = roteiroPorPeca.get(item.lote.pecaId);
    if (!roteiro) continue;
    const estado = estadoDoLote(
      roteiro,
      saldos.get(item.loteId),
      tipo,
      ordemDaCor,
      item.etapaId,
    );
    if (estado) {
      estado.corDoLote = item.lote.corId;
      estado.jaPerdido = perdaJaGravada.get(item.loteId) ?? 0;
      estados.set(item.loteId, estado);
    }
  }

  const quebras = new Map<string, number>();
  const relatos = new Map<string, string>();
  for (const q of quebrasInformadas) {
    if (q.quantidade > 0) {
      quebras.set(q.loteId, q.quantidade);
      if (q.motivo?.trim()) relatos.set(q.loteId, q.motivo.trim());
    }
  }

  let plano;
  try {
    plano = planejarConclusao(itens, estados, quebras);
  } catch (erro) {
    // erro de preenchimento vira mensagem de tela, não 500
    if (erro instanceof QuebraInvalida) throw invalido(erro.message);
    throw erro;
  }

  /*
   * BLOQUEIO PARA ANTES DE ESCREVER.
   *
   * Se algum lote não tem como ser movido — a etapa de queima sumiu do roteiro,
   * ou a próxima parada exige um esmalte que ninguém escolheu — a fornada NÃO
   * fecha. Fechar assim marcaria como concluída uma fornada com peça dentro, e
   * o botão de concluir só aparece enquanto ela está queimando: não haveria
   * caminho de volta pela tela.
   */
  if (plano.bloqueios.length > 0) {
    throw regraDeNegocio(plano.bloqueios.join(" · "));
  }

  /*
   * DUAS PESSOAS CONCLUINDO A MESMA FORNADA AO MESMO TEMPO.
   *
   * `movimentoJaGravado` confere antes de gravar, mas a conferência está fora
   * da transação: duas requisições simultâneas passam pelas duas e o índice
   * único do banco derruba a segunda. As peças NÃO avançam duas vezes — o que
   * chegava ao João era "Já existe um registro com esse nome", que não quer
   * dizer nada aqui.
   */
  try {
    for (const acao of plano.acoes) {
      // a perda primeiro: é o que de fato saiu do forno quebrado, e assim o
      // avanço nunca tenta mandar adiante peça que já não existe
      if (acao.perder > 0) {
        await registrarPerda(
          {
            loteId: acao.loteId,
            etapaId: acao.etapaOrigemId,
            quantidade: acao.perder,
            motivo:
              relatos.get(acao.loteId) ??
              `Quebrou na fornada ${queima.codigo}.`,
            motivoTipo: "quebra_forno",
            chaveIdempotencia: chaveDaConclusao(
              queima.id,
              acao.loteId,
              "perda",
            ),
          },
          sessao,
        );
      }
      if (acao.avancar > 0 && acao.etapaDestinoId) {
        await avancarLote(
          {
            loteId: acao.loteId,
            etapaOrigemId: acao.etapaOrigemId,
            etapaDestinoId: acao.etapaDestinoId,
            quantidade: acao.avancar,
            // só vai preenchido quando a etapa de destino exige esmalte, e aí é
            // a cor que o lote JÁ tem — o planejador barra o lote ainda neutro
            corId: acao.corId ?? null,
            motivo: `Saiu da fornada ${queima.codigo}.`,
            chaveIdempotencia: chaveDaConclusao(
              queima.id,
              acao.loteId,
              "avanco",
            ),
          },
          sessao,
        );
      }
    }
  } catch (erro) {
    if ((erro as { code?: string }).code === "P2002") {
      throw conflito(
        "Esta fornada já está sendo concluída em outro aparelho. Recarregue a tela para ver como ficou.",
      );
    }
    throw erro;
  }

  const atualizada = await prisma.queima.update({
    where: { id },
    data: { status: "concluida", concluidaEm: agora },
    include: { itens: true },
  });

  return {
    queima: atualizada,
    avancadas: plano.totalAvancado,
    perdidas: plano.totalPerdido,
    avisos: plano.avisos,
  };
}

/**
 * O que a tela precisa mostrar antes de concluir: lote, peça e quanto entrou.
 *
 * Vem do servidor, e não da lista que a tela já tinha, porque entre montar a
 * fornada e concluí-la alguém pode ter mexido no lote pelo quadro — e a tela
 * precisa avisar isso ANTES de o João assinar embaixo.
 */
export async function previaDaConclusao(id: string) {
  const queima = await prisma.queima.findUnique({
    where: { id },
    include: {
      itens: {
        include: {
          lote: {
            select: {
              id: true,
              codigo: true,
              pecaId: true,
              corId: true,
              peca: { select: { nome: true } },
            },
          },
        },
      },
    },
  });
  if (!queima) throw naoEncontrado("Queima");

  const tipo = queima.tipo === "biscoito" ? "biscoito" : "esmalte";
  const itensDaQueima = queima.itens as ItemComLote[];
  const etapaDaCor = await prisma.etapa.findFirst({
    where: { defineCor: true, ativo: true },
  });
  const ordemDaCor =
    (etapaDaCor as { ordemPadrao: number } | null)?.ordemPadrao ??
    Number.MAX_SAFE_INTEGER;

  const pecaIds = [...new Set(itensDaQueima.map((i) => i.lote.pecaId))];
  const roteiros = (await prisma.roteiroEtapa.findMany({
    where: { pecaId: { in: pecaIds } },
    orderBy: { ordem: "asc" },
    select: {
      pecaId: true,
      etapaId: true,
      etapa: {
        select: {
          nome: true,
          aguardaCarga: true,
          ordemPadrao: true,
          defineCor: true,
        },
      },
    },
  })) as LinhaDeRoteiro[];
  const roteiroPorPeca = new Map<string, LinhaDeRoteiro[]>();
  for (const linha of roteiros) {
    const lista = roteiroPorPeca.get(linha.pecaId) ?? [];
    lista.push(linha);
    roteiroPorPeca.set(linha.pecaId, lista);
  }

  const saldos = await saldosPorLote(itensDaQueima.map((i) => i.loteId));

  const jaGravados = (await prisma.movimentoLote.findMany({
    where: {
      chaveIdempotencia: {
        in: itensDaQueima.map((i) =>
          chaveDaConclusao(queima.id, i.loteId, "perda"),
        ),
      },
    },
    select: { loteId: true, quantidade: true },
  })) as { loteId: string; quantidade: number }[];
  const perdaJaGravada = new Map(
    jaGravados.map((m) => [m.loteId, m.quantidade]),
  );

  return {
    codigo: queima.codigo,
    status: queima.status,
    itens: itensDaQueima.map((i) => {
      const roteiro = roteiroPorPeca.get(i.lote.pecaId) ?? [];
      const estado = estadoDoLote(
        roteiro,
        saldos.get(i.loteId),
        tipo,
        ordemDaCor,
        i.etapaId,
      );
      const naEtapa = estado?.saldo ?? 0;
      const destino = roteiro.find((r) => r.etapaId === estado?.proximaEtapaId);
      const jaPerdido = perdaJaGravada.get(i.loteId) ?? 0;
      const restaDaCarga = Math.max(0, i.quantidade - jaPerdido);
      /*
       * A MESMA CONTA DO SERVIDOR, e não uma parecida.
       *
       * Se a prévia calculasse diferente de `planejarConclusao`, a tela diria
       * um número e o banco gravaria outro — que é a forma mais cara de errar,
       * porque ninguém desconfia do que leu na tela.
       */
      const aoConcluir = Math.min(restaDaCarga, naEtapa);
      // sem próxima etapa não há avanço: a peça fica onde está
      const podeAvancar = estado?.proximaEtapaId != null;
      // etapa seguinte escolhe o esmalte e o lote está neutro: só pelo quadro
      const esperandoEsmalte =
        podeAvancar && (estado?.proximaDefineCor ?? false) && !i.lote.corId;
      return {
        loteId: i.loteId,
        codigo: i.lote.codigo,
        pecaNome: i.lote.peca.nome,
        /** quanto deste lote entrou no forno */
        quantidade: i.quantidade,
        /** quanto ainda está parado na etapa de queima */
        naEtapa,
        /** o que ainda falta mover deste lote */
        aoConcluir,
        /** quanto já foi baixado como quebra desta fornada, numa tentativa anterior */
        jaPerdido,
        /** quantas de fato avançam de etapa */
        vaiAvancar: podeAvancar && !esperandoEsmalte ? aoConcluir : 0,
        esperandoEsmalte,
        proximaEtapa: destino?.etapa.nome ?? null,
      };
    }),
  };
}
