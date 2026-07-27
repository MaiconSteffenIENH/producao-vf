import { CrudSimples, type Registro } from '../components/CrudSimples'

type MateriaPrima = Registro & {
  tipo: string
  unidade: string
  estoqueAtual: string
  estoqueMinimo: string
  fornecedor: string | null
  ativo: boolean
}

export function MateriasPrimas() {
  return (
    <CrudSimples<MateriaPrima>
      titulo="Matérias-primas"
      descricao="Cadastro pronto para a Fase 2, quando o planejamento passar a sugerir 'comprar mais esmalte'."
      caminho="materias-primas"
      valoresIniciais={{
        nome: '',
        tipo: 'esmalte',
        unidade: 'kg',
        estoqueAtual: 0,
        estoqueMinimo: 0,
        fornecedor: '',
        ativo: true,
      }}
      campos={[
        { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
        {
          nome: 'tipo',
          rotulo: 'Tipo',
          tipo: 'select',
          opcoes: [
            { valor: 'argila', rotulo: 'Argila' },
            { valor: 'esmalte', rotulo: 'Esmalte' },
            { valor: 'oxido', rotulo: 'Óxido' },
            { valor: 'embalagem', rotulo: 'Embalagem' },
            { valor: 'outro', rotulo: 'Outro' },
          ],
        },
        { nome: 'unidade', rotulo: 'Unidade', tipo: 'texto', dica: 'kg, L, un…' },
        { nome: 'estoqueAtual', rotulo: 'Estoque atual', tipo: 'numero', passo: 0.001 },
        { nome: 'estoqueMinimo', rotulo: 'Estoque mínimo', tipo: 'numero', passo: 0.001 },
        { nome: 'fornecedor', rotulo: 'Fornecedor', tipo: 'texto' },
        { nome: 'ativo', rotulo: 'Ativa', tipo: 'booleano' },
      ]}
      colunas={[
        { rotulo: 'Nome', render: (m) => <span className="font-medium text-tinta">{m.nome}</span> },
        { rotulo: 'Tipo', render: (m) => m.tipo },
        {
          rotulo: 'Estoque',
          render: (m) => {
            const atual = Number(m.estoqueAtual)
            const minimo = Number(m.estoqueMinimo)
            const abaixo = minimo > 0 && atual < minimo
            return (
              <span className={abaixo ? 'font-medium text-alerta' : ''}>
                {atual} {m.unidade}
                {abaixo && <span className="ml-1 text-xs">(abaixo de {minimo})</span>}
              </span>
            )
          },
        },
        {
          rotulo: 'Fornecedor',
          render: (m) => m.fornecedor || '—',
          className: 'hidden md:table-cell',
        },
      ]}
    />
  )
}
