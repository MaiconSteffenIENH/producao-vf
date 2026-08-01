import { CrudSimples, type Registro } from '../components/CrudSimples'

type Categoria = Registro & { ordem: number; ativo: boolean }

export function Categorias() {
  return (
    <CrudSimples<Categoria>
      titulo="Categorias"
      descricao="Os grupos que aparecem no site: Bowls, Café, Pratos…"
      caminho="categorias"
      // a ordem se resolve arrastando a linha; o campo do modal virou exceção
      campoOrdem="ordem"
      valoresIniciais={{ nome: '', ordem: 0, ativo: true }}
      campos={[
        { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
        {
          nome: 'ordem',
          rotulo: 'Ordem',
          tipo: 'numero',
          dica: 'Menor aparece primeiro nas listas. O caminho normal é arrastar a linha.',
        },
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
