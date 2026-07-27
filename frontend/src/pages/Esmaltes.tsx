import { CrudSimples, type Registro } from '../components/CrudSimples'
import { ChipCor } from '../components/ui'

type Cor = Registro & {
  hex: string
  amostraUrl: string | null
  malhado: boolean
  observacao: string | null
  ativo: boolean
}

export function Esmaltes() {
  return (
    <CrudSimples<Cor>
      titulo="Esmaltes"
      descricao="A cor é decidida depois da queima de biscoito, conforme a demanda — por isso ela vive aqui, separada da peça."
      caminho="cores"
      valoresIniciais={{ nome: '', hex: '#CCCCCC', amostraUrl: '', malhado: false, observacao: '', ativo: true }}
      campos={[
        { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
        { nome: 'hex', rotulo: 'Cor aproximada', tipo: 'cor', dica: 'Serve só para o chip na tela.' },
        {
          nome: 'malhado',
          rotulo: 'Esmalte malhado',
          tipo: 'booleano',
          dica: 'Branco e Pedra Sabão têm quase a mesma cor média — marque para lembrar que só a foto diferencia.',
        },
        {
          nome: 'amostraUrl',
          rotulo: 'Foto de amostra',
          tipo: 'url',
          dica: 'Link de uma foto da peça esmaltada. É o que realmente distingue os malhados no Kanban.',
        },
        { nome: 'observacao', rotulo: 'Observação', tipo: 'textarea' },
        { nome: 'ativo', rotulo: 'Ativo', tipo: 'booleano' },
      ]}
      colunas={[
        {
          rotulo: 'Esmalte',
          render: (c) => <ChipCor nome={c.nome} hex={c.hex} amostraUrl={c.amostraUrl} malhado={c.malhado} tamanho={24} />,
        },
        { rotulo: 'Hex', render: (c) => <span className="font-mono text-xs text-tinta-fraca">{c.hex}</span> },
        { rotulo: 'Malhado', render: (c) => (c.malhado ? 'Sim' : 'Não') },
        {
          rotulo: 'Observação',
          render: (c) => <span className="text-tinta-fraca">{c.observacao || '—'}</span>,
          className: 'hidden md:table-cell max-w-xs truncate',
        },
        { rotulo: 'Situação', render: (c) => (c.ativo ? 'Ativo' : 'Inativo') },
      ]}
    />
  )
}
