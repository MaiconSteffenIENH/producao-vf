import { z } from 'zod'

const texto = (max = 120) => z.string().trim().min(1, 'obrigatório').max(max)
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
  nome: texto(60),
  ordem: z.coerce.number().int().min(0).default(0),
  ativo: z.boolean().default(true),
})

export const corSchema = z.object({
  nome: texto(60),
  hex: hex.default('#CCCCCC'),
  amostraUrl: z.string().trim().url('link inválido').or(z.literal('')).optional().nullable(),
  malhado: z.boolean().default(false),
  observacao: z.string().trim().max(300).or(z.literal('')).optional().nullable(),
  ativo: z.boolean().default(true),
})

export const responsavelSchema = z.object({
  nome: texto(60),
  tipo: z.enum(['pessoa', 'equipe', 'forno']).default('pessoa'),
  cor: hex.default('#BBA58C'),
  capacidadeDiaria: z.coerce.number().int().min(0).max(9999).nullable().optional(),
  usuarioId: z.string().uuid().nullable().optional(),
  ativo: z.boolean().default(true),
})

export const etapaSchema = z.object({
  nome: texto(60),
  tipo: z.enum(['producao', 'secagem', 'queima', 'estoque', 'final']).default('producao'),
  ordemPadrao: z.coerce.number().int().min(0).default(0),
  defineCor: z.boolean().default(false),
  estoqueIntermediario: z.boolean().default(false),
  responsavelPadraoId: z.string().uuid().nullable().optional(),
  ativo: z.boolean().default(true),
})

export const materiaPrimaSchema = z.object({
  nome: texto(80),
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
  nome: texto(80),
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
  nome: texto(80),
  email: z.string().trim().email('e-mail inválido'),
  papelId: z.string().uuid('escolha um papel'),
  senha: z.string().min(8).max(72).or(z.literal('')).optional(),
  ativo: z.boolean().default(true),
})

// ── Produção (Fase 3) ───────────────────────────────────
export const criarLoteSchema = z.object({
  pecaId: z.string().uuid('escolha a peça'),
  quantidade: z.coerce.number().int().min(1, 'quantidade mínima 1').max(99999),
  observacao: z.string().trim().max(300).or(z.literal('')).optional().nullable(),
  origem: z.enum(['manual', 'planejamento']).default('manual'),
})

export const avancarLoteSchema = z.object({
  etapaOrigemId: z.string().uuid(),
  etapaDestinoId: z.string().uuid(),
  quantidade: z.coerce.number().int().min(1).max(99999),
  corId: z.string().uuid().or(z.literal('')).nullable().optional(),
  responsavelId: z.string().uuid().or(z.literal('')).nullable().optional(),
  motivo: z.string().trim().max(300).or(z.literal('')).optional().nullable(),
})

export const perdaSchema = z.object({
  etapaId: z.string().uuid(),
  quantidade: z.coerce.number().int().min(1).max(99999),
  motivo: z.string().trim().min(1, 'diga o que aconteceu').max(300),
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
  nome: texto(60),
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
