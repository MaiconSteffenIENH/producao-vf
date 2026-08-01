import { useCallback, useState } from 'react'
import { CrudSimples, type Registro } from '../components/CrudSimples'
import { Etiqueta } from '../components/ui'
import { api } from '../services/api'

type Responsavel = Registro & {
  tipo: string
  cor: string
  capacidadeDiaria: number | null
  usuarioId: string | null
  ativo: boolean
  usuario?: { id: string; nome: string; email: string } | null
}

/*
 * "Forno" continua aqui só para LER o histórico: os fornos antigos ficaram
 * inativos e os movimentos que os citam continuam mostrando o nome certo.
 * Ele saiu das opções de criação — forno deixou de ser um responsável de
 * mentira e virou configuração da própria etapa de queima, em Etapas.
 */
const ROTULO_TIPO: Record<string, string> = { pessoa: 'Pessoa', equipe: 'Equipe', forno: 'Forno' }

export function Responsaveis() {
  const [usuarios, setUsuarios] = useState<{ valor: string; rotulo: string }[]>([])

  const carregarUsuarios = useCallback(async () => {
    try {
      const { data } = await api.get('/usuarios')
      setUsuarios(data.map((u: { id: string; nome: string }) => ({ valor: u.id, rotulo: u.nome })))
    } catch {
      // quem não é admin não lista usuários — o campo simplesmente fica vazio
      setUsuarios([])
    }
  }, [])

  return (
    <CrudSimples<Responsavel>
      titulo="Responsáveis"
      descricao="Quem executa cada etapa: o oleiro e a equipe da Vera. O forno não entra aqui — a capacidade de cada carga fica na própria etapa de queima, em Etapas."
      caminho="responsaveis"
      aoCarregarAuxiliares={carregarUsuarios}
      valoresIniciais={{ nome: '', tipo: 'pessoa', cor: '#BBA58C', capacidadeDiaria: null, usuarioId: '', ativo: true }}
      campos={[
        { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
        {
          nome: 'tipo',
          rotulo: 'Tipo',
          tipo: 'select',
          opcoes: [
            { valor: 'pessoa', rotulo: 'Pessoa' },
            { valor: 'equipe', rotulo: 'Equipe' },
          ],
        },
        { nome: 'cor', rotulo: 'Cor de identificação', tipo: 'cor', dica: 'Usada nos cartões do Kanban.' },
        {
          nome: 'capacidadeDiaria',
          rotulo: 'Capacidade diária (peças)',
          tipo: 'numero',
          dica: 'Base da meta do dia. O que não sair hoje soma amanhã; o que passar da meta abate do dia seguinte.',
        },
        {
          nome: 'usuarioId',
          rotulo: 'Login vinculado',
          tipo: 'select',
          opcoes: usuarios,
          permiteVazio: true,
          dica: 'Vincule para a pessoa abrir o app e ver só a fila dela.',
        },
        { nome: 'ativo', rotulo: 'Ativo', tipo: 'booleano' },
      ]}
      colunas={[
        {
          rotulo: 'Nome',
          render: (r) => (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: r.cor }} />
              <span className="font-medium text-tinta">{r.nome}</span>
            </span>
          ),
        },
        { rotulo: 'Tipo', render: (r) => <Etiqueta cor={r.cor}>{ROTULO_TIPO[r.tipo] ?? r.tipo}</Etiqueta> },
        {
          rotulo: 'Capacidade/dia',
          render: (r) => (r.capacidadeDiaria ? `${r.capacidadeDiaria} peças` : '—'),
        },
        {
          rotulo: 'Login',
          render: (r) => r.usuario?.nome ?? '—',
          className: 'hidden md:table-cell',
        },
        { rotulo: 'Situação', render: (r) => (r.ativo ? 'Ativo' : 'Inativo') },
      ]}
    />
  )
}
