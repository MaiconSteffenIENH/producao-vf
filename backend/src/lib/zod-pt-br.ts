import { z, type ZodErrorMap } from 'zod'

/**
 * MENSAGEM DE VALIDAÇÃO EM PORTUGUÊS.
 *
 * O zod fala inglês por padrão, e a tela repassava o texto cru: "quantidade:
 * Expected number, received nan" apareceu no rodapé do quadro (pego pelo e2e
 * do BDD-6). Mensagem escrita no schema continua valendo; esta tabela cobre o
 * que o schema não escreveu.
 */
const TIPO: Record<string, string> = {
  string: 'texto',
  number: 'número',
  boolean: 'sim ou não',
  date: 'data',
  array: 'lista',
  object: 'objeto',
}

export const mensagensEmPortugues: ZodErrorMap = (issue, contexto) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') return { message: 'obrigatório' }
      if (issue.received === 'nan') return { message: 'informe um número' }
      return { message: `esperava ${TIPO[issue.expected] ?? issue.expected}` }
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: issue.minimum === 1 ? 'obrigatório' : `mínimo de ${issue.minimum} caracteres` }
      if (issue.type === 'array') return { message: `informe ao menos ${issue.minimum}` }
      return { message: `mínimo ${issue.minimum}` }
    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `máximo de ${issue.maximum} caracteres` }
      return { message: `máximo ${issue.maximum}` }
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'e-mail inválido' }
      if (issue.validation === 'uuid') return { message: 'identificador inválido' }
      return { message: 'formato inválido' }
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `use um destes: ${issue.options.join(', ')}` }
    case z.ZodIssueCode.invalid_date:
      return { message: 'data inválida' }
    case z.ZodIssueCode.unrecognized_keys:
      return { message: 'campo desconhecido' }
    default:
      return { message: contexto.defaultError }
  }
}

/** um nome de campo legível na mensagem do topo ("quantidade", "itens 2 peça") */
export function caminhoLegivel(caminho: (string | number)[]): string {
  return caminho.map((p) => (typeof p === 'number' ? String(p + 1) : p)).join(' ')
}
