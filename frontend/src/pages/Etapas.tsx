import { useCallback, useState } from 'react'
import { CrudSimples, type Registro } from '../components/CrudSimples'
import { Etiqueta } from '../components/ui'
import { api } from '../services/api'

type Etapa = Registro & {
  tipo: string
  ordemPadrao: number
  defineCor: boolean
  estoqueIntermediario: boolean
  responsavelPadraoId: string | null
  ativo: boolean
  responsavelPadrao?: { id: string; nome: string; cor: string } | null
}

const ROTULO_TIPO: Record<string, string> = {
  producao: 'Produção',
  secagem: 'Secagem',
  queima: 'Queima',
  estoque: 'Estoque',
  final: 'Final',
  // sem uma etapa deste tipo cadastrada, o botão "Segunda" do quadro dá erro —
  // e até agora não havia como criá-la por aqui
  segunda: 'Segunda qualidade',
  foto: 'Foto',
}

export function Etapas() {
  const [responsaveis, setResponsaveis] = useState<{ valor: string; rotulo: string }[]>([])

  const carregarResponsaveis = useCallback(async () => {
    const { data } = await api.get('/responsaveis')
    setResponsaveis(data.map((r: { id: string; nome: string }) => ({ valor: r.id, rotulo: r.nome })))
  }, [])

  return (
    <CrudSimples<Etapa>
      titulo="Etapas"
      descricao="As paradas do caminho até a peça pronta. Cada peça monta o roteiro dela com estas etapas."
      caminho="etapas"
      aoCarregarAuxiliares={carregarResponsaveis}
      // a ordem se resolve arrastando a linha; o campo do modal virou exceção
      campoOrdem="ordemPadrao"
      valoresIniciais={{
        nome: '',
        tipo: 'producao',
        ordemPadrao: 0,
        defineCor: false,
        estoqueIntermediario: false,
        aguardaCarga: false,
        capacidadeCarga: null,
        horasPorQueima: null,
        responsavelPadraoId: '',
        ativo: true,
      }}
      campos={[
        { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
        {
          nome: 'tipo',
          rotulo: 'Tipo',
          tipo: 'select',
          opcoes: Object.entries(ROTULO_TIPO).map(([valor, rotulo]) => ({ valor, rotulo })),
        },
        {
          nome: 'ordemPadrao',
          rotulo: 'Ordem sugerida',
          tipo: 'numero',
          dica: 'Só ordena a lista; o roteiro de cada peça manda. O caminho normal é arrastar a linha.',
        },
        {
          nome: 'responsavelPadraoId',
          rotulo: 'Responsável padrão',
          tipo: 'select',
          opcoes: responsaveis,
          permiteVazio: true,
        },
        /*
         * Os três campos do forno. A capacidade mora na ETAPA e não num
         * responsável do tipo forno: a pergunta que a tela do Forno faz é
         * "cabe mais NESTA queima?", e o ateliê tem um forno para a 1ª e
         * outro para a 2ª, de tamanhos diferentes. Sem a capacidade
         * preenchida, a fila do forno não aparece — de propósito, porque
         * chutar um número que a Vera tomaria por verdade é pior que calar.
         */
        {
          nome: 'aguardaCarga',
          rotulo: 'Espera o forno encher',
          tipo: 'booleano',
          dica: 'Marque nas queimas. A peça não espera a etapa, espera a carga fechar — é isso que põe a etapa na fila do Forno e o que a previsão de prazo usa para não prometer data que o ateliê não cumpre.',
        },
        {
          nome: 'capacidadeCarga',
          rotulo: 'Capacidade por carga (peças)',
          tipo: 'numero',
          dica: 'Quantas peças cabem numa fornada desta queima. Sem este número a fila do Forno não aparece.',
        },
        {
          nome: 'horasPorQueima',
          rotulo: 'Horas por queima',
          tipo: 'numero',
          dica: 'De aquecer a esfriar. Serve para a previsão saber quanto o forno fica ocupado.',
        },
        {
          nome: 'defineCor',
          rotulo: 'É aqui que a cor é decidida',
          tipo: 'booleano',
          dica: 'Só uma etapa pode ter isto. Antes dela o lote é biscoito neutro; depois, ele tem esmalte.',
        },
        {
          nome: 'estoqueIntermediario',
          rotulo: 'É estoque parado',
          tipo: 'booleano',
          dica: 'O biscoito pode ficar aqui indefinidamente até a demanda dizer de que cor ele vai ser.',
        },
        { nome: 'ativo', rotulo: 'Ativa', tipo: 'booleano' },
      ]}
      colunas={[
        {
          rotulo: 'Etapa',
          render: (e) => (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-tinta">{e.nome}</span>
              {e.defineCor && <Etiqueta cor="#B8963E">define a cor</Etiqueta>}
              {e.estoqueIntermediario && <Etiqueta cor="#3E5C4B">estoque</Etiqueta>}
            </span>
          ),
        },
        { rotulo: 'Tipo', render: (e) => ROTULO_TIPO[e.tipo] ?? e.tipo },
        { rotulo: 'Ordem', render: (e) => e.ordemPadrao },
        {
          rotulo: 'Responsável padrão',
          render: (e) => e.responsavelPadrao?.nome ?? '—',
          className: 'hidden md:table-cell',
        },
      ]}
    />
  )
}
