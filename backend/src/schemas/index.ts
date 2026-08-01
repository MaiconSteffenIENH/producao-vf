import { z } from 'zod'
import { caixaAlta } from '../lib/nomes'

const texto = (max = 120) => z.string().trim().min(1, 'obrigatório').max(max)

/*
 * Nome de cadastro, normalizado no SERVIDOR também.
 *
 * A tela já sobe para maiúscula enquanto se digita, mas quem manda o dado não
 * é sempre a tela: importação de planilha, um cliente antigo em cache, um
 * curl. Se a regra vivesse só no navegador, o banco acabaria com "PRATO DE
 * PÃO" e "Prato de Pão" convivendo — dois nomes para a mesma peça, e a busca
 * achando um deles.
 */
const nomeDeCadastro = (max = 120) => texto(max).transform(caixaAlta)
const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'use o formato #RRGGBB')

// ── Auth ────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().trim().email('e-mail inválido'),
  senha: z.string().min(1, 'informe a senha'),
})

export const trocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1, 'informe a senha atual'),
  senhaNova: z.string().min(8, 'a senha nova precisa de pelo menos 8 caracteres').max(72),
})

// ── Cadastros simples ───────────────────────────────────
export const categoriaSchema = z.object({
  nome: nomeDeCadastro(60),
  ordem: z.coerce.number().int().min(0).default(0),
  ativo: z.boolean().default(true),
})

/**
 * Os ids na ordem nova, do jeito que o arrasto deixou a lista na tela.
 *
 * Leniente de propósito, como o resto: lista vazia, id repetido e id que já
 * não existe passam por aqui e são resolvidos em `lib/ordenacao.ts`. Recusar
 * no zod devolveria um 400 genérico justamente onde o service tem uma frase
 * em pt-BR explicando que a lista mudou por baixo de quem arrastou.
 */
export const ordenacaoSchema = z.object({
  ids: z.array(z.string()).default([]),
})

export const corSchema = z.object({
  nome: nomeDeCadastro(60),
  hex: hex.default('#CCCCCC'),
  amostraUrl: z.string().trim().url('link inválido').or(z.literal('')).optional().nullable(),
  malhado: z.boolean().default(false),
  observacao: z.string().trim().max(300).or(z.literal('')).optional().nullable(),
  ativo: z.boolean().default(true),
})

export const responsavelSchema = z.object({
  nome: nomeDeCadastro(60),
  tipo: z.enum(['pessoa', 'equipe', 'forno']).default('pessoa'),
  cor: hex.default('#BBA58C'),
  capacidadeDiaria: z.coerce.number().int().min(0).max(9999).nullable().optional(),
  usuarioId: z.string().uuid().nullable().optional(),
  ativo: z.boolean().default(true),
})

export const etapaSchema = z.object({
  nome: nomeDeCadastro(60),
  // `segunda` e `foto` estavam no schema do banco e faltavam aqui — sem uma
  // etapa do tipo `segunda` cadastrada, o botão "Segunda" do quadro devolve
  // erro, e não havia como criá-la pela tela
  tipo: z
    .enum(['producao', 'secagem', 'queima', 'estoque', 'final', 'segunda', 'foto'])
    .default('producao'),
  ordemPadrao: z.coerce.number().int().min(0).default(0),
  defineCor: z.boolean().default(false),
  estoqueIntermediario: z.boolean().default(false),
  // do forno: a carga é da ETAPA, não de um responsável de mentira
  aguardaCarga: z.boolean().default(false),
  capacidadeCarga: z.coerce.number().int().min(0).max(99999).nullable().optional(),
  horasPorQueima: z.coerce.number().int().min(0).max(999).nullable().optional(),
  responsavelPadraoId: z.string().uuid().nullable().optional(),
  ativo: z.boolean().default(true),
})

export const materiaPrimaSchema = z.object({
  nome: nomeDeCadastro(80),
  tipo: z.enum(['argila', 'esmalte', 'oxido', 'embalagem', 'outro']).default('esmalte'),
  unidade: z.string().trim().min(1).max(10).default('kg'),
  estoqueAtual: z.coerce.number().min(0).default(0),
  estoqueMinimo: z.coerce.number().min(0).default(0),
  fornecedor: z.string().trim().max(80).or(z.literal('')).optional().nullable(),
  ativo: z.boolean().default(true),
})

// ── Peça ────────────────────────────────────────────────
// Backend leniente, validação de regra no service: linhas em branco de
// formulário dinâmico chegam aqui e o service filtra em vez de estourar 400.
export const roteiroItemSchema = z.object({
  etapaId: z.string().uuid().or(z.literal('')),
  responsavelId: z.string().uuid().or(z.literal('')).nullable().optional(),
  diasEstimados: z.coerce.number().int().min(0).max(365).default(1),
})

export const pecaCorItemSchema = z.object({
  corId: z.string().uuid().or(z.literal('')),
  qtdMinimaDesejada: z.coerce.number().int().min(0).max(99999).default(0),
})

export const pecaSchema = z.object({
  nome: nomeDeCadastro(80),
  categoriaId: z.string().uuid('escolha uma categoria'),
  responsavelInicialId: z.string().uuid().or(z.literal('')).nullable().optional(),
  tempoMedioDias: z.coerce.number().int().min(1).max(365).default(30),
  qtdMinimaDesejada: z.coerce.number().int().min(0).max(99999).default(0),
  qtdMinimaBiscoito: z.coerce.number().int().min(0).max(99999).default(0),
  precoBase: z.coerce.number().min(0).max(999999).nullable().optional(),
  observacao: z.string().trim().max(500).or(z.literal('')).optional().nullable(),
  ativo: z.boolean().default(true),
  roteiro: z.array(roteiroItemSchema).default([]),
  cores: z.array(pecaCorItemSchema).default([]),
})

// ── Usuário ─────────────────────────────────────────────
export const usuarioSchema = z.object({
  nome: nomeDeCadastro(80),
  email: z.string().trim().email('e-mail inválido'),
  papelId: z.string().uuid('escolha um papel'),
  senha: z.string().min(8).max(72).or(z.literal('')).optional(),
  ativo: z.boolean().default(true),
})

// ── Produção (Fase 3) ───────────────────────────────────
export const criarLoteSchema = z.object({
  encomendaId: z.string().uuid().optional().nullable(),
  pecaId: z.string().uuid('escolha a peça'),
  quantidade: z.coerce.number().int().min(1, 'quantidade mínima 1').max(99999),
  observacao: z.string().trim().max(300).or(z.literal('')).optional().nullable(),
  origem: z.enum(['manual', 'planejamento']).default('manual'),
})

export const avancarLoteSchema = z.object({
  chaveIdempotencia: z.string().trim().min(8).max(80).optional().nullable(),
  etapaOrigemId: z.string().uuid(),
  etapaDestinoId: z.string().uuid(),
  quantidade: z.coerce.number().int().min(1).max(99999),
  corId: z.string().uuid().or(z.literal('')).nullable().optional(),
  responsavelId: z.string().uuid().or(z.literal('')).nullable().optional(),
  motivo: z.string().trim().max(300).or(z.literal('')).optional().nullable(),
})

export const perdaSchema = z.object({
  chaveIdempotencia: z.string().trim().min(8).max(80).optional().nullable(),
  etapaId: z.string().uuid(),
  quantidade: z.coerce.number().int().min(1).max(99999),
  // o relato escrito continua obrigatório: a lista de motivos agrupa para
  // somar, mas é o texto que explica o caso para quem ler daqui a três meses
  motivo: z.string().trim().min(1, 'diga o que aconteceu').max(300),
  /*
   * Motivo tipado solto aqui de propósito, e conferido contra a lista canônica
   * no service (lib/motivos-perda.ts). Um `z.enum` devolveria 400 com mensagem
   * de biblioteca, em inglês, antes de o service poder explicar em pt-BR o que
   * vale — e a lista é editada num arquivo só, não em dois.
   */
  motivoTipo: z.string().trim().max(40).or(z.literal('')).optional().nullable(),
})

export const divisaoSchema = z.object({
  etapaId: z.string().uuid(),
  quantidade: z.coerce.number().int().min(1).max(99999),
  motivo: z.string().trim().max(300).or(z.literal('')).optional().nullable(),
})

export const cancelarLoteSchema = z.object({
  motivo: z.string().trim().min(1, 'diga o motivo').max(300),
})

// ── Precificação (Fase 4) ───────────────────────────────
const dinheiro = z.coerce.number().min(0).max(9_999_999)
const percentual = z.coerce.number().min(0).max(100)

export const custoPecaSchema = z.object({
  custoArgila: dinheiro.default(0),
  custoEsmalte: dinheiro.default(0),
  custoQueima: dinheiro.default(0),
  custoEmbalagem: dinheiro.default(0),
  minutosMaoDeObra: z.coerce.number().int().min(0).max(10_000).default(0),
  custoHoraMaoDeObra: dinheiro.default(0),
  outrosCustos: dinheiro.default(0),
  perdaEstimadaPercentual: percentual.default(10),
  precos: z
    .array(
      z.object({
        canalId: z.string().uuid().or(z.literal('')),
        precoAtual: z.coerce.number().min(0).max(9_999_999).nullable().optional(),
      }),
    )
    .default([]),
})

export const canalVendaSchema = z.object({
  nome: nomeDeCadastro(60),
  comissaoPercentual: percentual.default(0),
  taxaFixa: dinheiro.default(0),
  freteSubsidiado: dinheiro.default(0),
  percentualAds: percentual.default(0),
  percentualImposto: percentual.default(0),
  percentualAntecipacao: percentual.default(0),
  margemAlvoPercentual: z.coerce.number().min(0).max(1000).default(100),
  moeda: z.string().trim().min(3).max(3).default('BRL'),
  observacao: z.string().trim().max(300).or(z.literal('')).optional().nullable(),
  ativo: z.boolean().default(true),
  ordem: z.coerce.number().int().min(0).default(0),
  faixas: z
    .array(
      z.object({
        valorMinimo: dinheiro.default(0),
        valorMaximo: z.coerce.number().min(0).max(9_999_999).nullable().optional(),
        comissaoPercentual: percentual.default(0),
        taxaFixa: dinheiro.default(0),
        freteSubsidiado: dinheiro.default(0),
      }),
    )
    .default([]),
})

// ── Fase 4: o que o processo do ateliê pedia ────────────

const dataIso = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use o formato AAAA-MM-DD')

const competencia = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, 'use o formato AAAA-MM')

/** Chave que o cliente gera antes de mandar, para o reenvio offline não duplicar. */
const chaveIdempotencia = z.string().trim().min(8).max(80).optional().nullable()

export const segundaSchema = z.object({
  etapaId: z.string().uuid(),
  quantidade: z.coerce.number().int().min(1),
  motivo: texto(200),
  chaveIdempotencia,
})

export const folgaSchema = z.object({
  responsavelId: z.string().uuid(),
  data: dataIso,
  motivo: z.enum(['folga', 'feriado', 'atestado', 'outro']).default('folga'),
  observacao: z.string().trim().max(200).or(z.literal('')).optional().nullable(),
})

export const queimaSchema = z.object({
  tipo: z.enum(['biscoito', 'esmalte']),
  previstaPara: z.string().trim().optional().nullable(),
  observacao: z.string().trim().max(300).or(z.literal('')).optional().nullable(),
})

export const statusQueimaSchema = z.object({
  status: z.enum(['planejada', 'carregando', 'queimando', 'concluida', 'cancelada']),
})

export const vendaSchema = z.object({
  pecaId: z.string().uuid(),
  corId: z.string().uuid().optional().nullable(),
  canalId: z.string().uuid().optional().nullable(),
  competencia,
  quantidade: z.coerce.number().int().min(0),
  valorTotal: z.coerce.number().min(0).max(99_999_999).optional().nullable(),
})

export const importarVendasSchema = z.object({
  // o CSV chega como texto no corpo: evita multipart e a Vera pode até colar
  conteudo: z.string().min(1, 'cole ou envie o conteúdo da planilha').max(5_000_000),
  canalId: z.string().uuid().optional().nullable(),
})

export const encomendaSchema = z.object({
  cliente: texto(120),
  contato: z.string().trim().max(120).or(z.literal('')).optional().nullable(),
  status: z.enum(['aberta', 'em_producao', 'pronta', 'entregue', 'cancelada']).optional(),
  entregarAte: dataIso.optional().nullable(),
  observacao: z.string().trim().max(500).or(z.literal('')).optional().nullable(),
  itens: z
    .array(
      z.object({
        pecaId: z.string().uuid(),
        corId: z.string().uuid().optional().nullable(),
        quantidade: z.coerce.number().int().min(1),
      }),
    )
    .min(1, 'a encomenda precisa de ao menos um item'),
})

export const fotoSchema = z.object({
  status: z.enum(['pendente', 'fotografado', 'enviado', 'editado', 'publicado']).optional(),
  fotoUrl: z.string().trim().url('informe uma URL válida').or(z.literal('')).optional().nullable(),
  observacao: z.string().trim().max(300).or(z.literal('')).optional().nullable(),
})

export const pecaInsumoSchema = z.object({
  materiaPrimaId: z.string().uuid(),
  quantidadePorPeca: z.coerce.number().min(0).max(99_999),
  etapaId: z.string().uuid().optional().nullable(),
  corId: z.string().uuid().optional().nullable(),
})
