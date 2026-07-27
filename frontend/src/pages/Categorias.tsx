import { CrudSimples, type Registro } from '../components/CrudSimples'

type Categoria = Registro & { ordem: number; ativo: boolean }

export function Categorias() {
  return (
    <CrudSimples<Categoria>
      titulo="Categorias"
      descricao="Os grupos que aparecem no site: Bowls, Café, Pratos…"
      caminho="categorias"
      valoresIniciais={{ nome: '', ordem: 0, ativo: true }}
      campos={[
        { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
        { nome: 'ordem', rotulo: 'Ordem', tipo: 'numero', dica: 'Menor aparece primeiro nas listas.' },
        { nome: 'ativo', rotulo: 'Ativa', tipo: 'booleano' },
      ]}
      colunas={[
        { rotulo: 'Nome', render: (c) => <span className="font-medium text-tinta">{c.nome}</span> },
        { rotulo: 'Ordem', render: (c) => c.ordem },
        { rotulo: 'Situação', render: (c) => (c.ativo ? 'Ativa' : 'Inativa') },
      ]}
    />
  )
}
