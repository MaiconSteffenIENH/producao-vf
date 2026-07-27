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
