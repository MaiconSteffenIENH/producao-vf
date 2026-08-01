/*
 * O QUE O ATELIÊ USA — o registro dos módulos do sistema.
 *
 * Módulo é um item do menu lateral. Nem mais nem menos: se aparece no menu, é
 * módulo; se não aparece, não é. Essa definição estreita é de propósito — sem
 * ela "módulo" vira palavra elástica e a tela de configuração passa a oferecer
 * caixinhas que ninguém sabe o que desligam.
 *
 * ESTA LISTA VIVE EM DOIS ARQUIVOS IGUAIS, aqui e em
 * frontend/src/lib/modulos.ts. Duplicar lista costuma ser erro; aqui não é. O
 * backend não importa código do frontend nem o contrário, e criar um pacote
 * compartilhado para vinte linhas custaria mais do que a cópia. O que protege
 * os dois é o teste que compara as listas e falha se elas divergirem — a cópia
 * é vigiada, não confiada.
 *
 * ESCONDER O MENU NÃO É PERMISSÃO. Se a rota da API continua respondendo, o
 * dado está a um `curl` de distância e a "permissão" é decoração. Por isso o
 * mesmo registro é lido dos dois lados.
 */

export type GrupoDeModulo = 'producao' | 'precos' | 'cadastros' | 'sistema'

export type Modulo = {
  /** identificador estável — é o que fica gravado no banco, NUNCA muda */
  chave: string
  rotulo: string
  rota: string
  grupo: GrupoDeModulo
  /**
   * Não pode ser desligado. Não é capricho: sem Início a pessoa entra e não
   * tem para onde ir, e sem Ajustes ela não troca a senha provisória — ficaria
   * trancada do lado de fora por uma caixinha desmarcada sem querer.
   */
  essencial?: boolean
  somenteAdmin?: boolean
  /** o que se perde ao desligar — a tela de configuração mostra esta frase */
  oQuePerde: string
}

export const MODULOS: readonly Modulo[] = [
  { chave: 'inicio', rotulo: 'Início', rota: '/', grupo: 'producao', essencial: true,
    oQuePerde: 'A tela de abertura. Sem ela não há por onde começar o dia.' },
  { chave: 'planejamento', rotulo: 'Planejamento', rota: '/planejamento', grupo: 'producao',
    oQuePerde: 'As sugestões do que produzir. O cálculo continua rodando; só a tela some.' },
  { chave: 'producao', rotulo: 'Quadro de produção', rota: '/producao', grupo: 'producao', essencial: true,
    oQuePerde: 'O quadro onde o trabalho é registrado. Sem ele nada anda.' },
  { chave: 'meu-dia', rotulo: 'Tarefas do dia', rota: '/meu-dia', grupo: 'producao',
    oQuePerde: 'A meta diária de cada pessoa e a fila do que está parado com ela.' },
  { chave: 'forno', rotulo: 'Forno', rota: '/forno', grupo: 'producao',
    oQuePerde: 'A fila do forno, o quanto falta para fechar carga e a montagem de fornada.' },
  { chave: 'encomendas', rotulo: 'Encomendas', rota: '/encomendas', grupo: 'producao',
    oQuePerde: 'Os pedidos com cliente e prazo. Encomenda já registrada continua no planejamento.' },
  { chave: 'fotos', rotulo: 'Fotos', rota: '/fotos', grupo: 'producao',
    oQuePerde: 'A fila de fotos. O planejamento continua sabendo que peça sem foto não vende.' },
  { chave: 'historico', rotulo: 'Histórico', rota: '/historico', grupo: 'producao',
    oQuePerde: 'A consulta ao caminho de cada lote. Nada é apagado.' },
  { chave: 'pecas', rotulo: 'Peças', rota: '/pecas', grupo: 'producao', essencial: true,
    oQuePerde: 'O catálogo e os roteiros. É de onde o planejamento tira tudo.' },
  { chave: 'estoque-biscoito', rotulo: 'Estoque de biscoito', rota: '/estoque/biscoito', grupo: 'producao',
    oQuePerde: 'A visão do biscoito parado por peça, com o mínimo de cada uma.' },
  { chave: 'estoque-prontas', rotulo: 'Peças prontas', rota: '/estoque/prontas', grupo: 'producao',
    oQuePerde: 'A visão do estoque pronto para venda, por peça e esmalte.' },
  { chave: 'vendas', rotulo: 'Vendas e cobertura', rota: '/vendas', grupo: 'precos',
    oQuePerde: 'O cruzamento de venda com produção e a importação de planilha.' },
  { chave: 'precos', rotulo: 'Preços por canal', rota: '/precos', grupo: 'precos',
    oQuePerde: 'O preço sugerido por canal e o cadastro de custo de cada peça.' },
  { chave: 'canais', rotulo: 'Canais de venda', rota: '/canais', grupo: 'precos',
    oQuePerde: 'O cadastro de taxas dos marketplaces, que alimenta a tela de Preços.' },
  { chave: 'esmaltes', rotulo: 'Esmaltes', rota: '/esmaltes', grupo: 'cadastros',
    oQuePerde: 'O cadastro de cores. Esmalte já usado continua aparecendo nos lotes.' },
  { chave: 'categorias', rotulo: 'Categorias', rota: '/categorias', grupo: 'cadastros',
    oQuePerde: 'O cadastro de categorias. As peças continuam agrupadas como estão.' },
  { chave: 'responsaveis', rotulo: 'Responsáveis', rota: '/responsaveis', grupo: 'cadastros',
    oQuePerde: 'O cadastro de quem executa cada etapa, e dos fornos.' },
  { chave: 'etapas', rotulo: 'Etapas', rota: '/etapas', grupo: 'cadastros',
    oQuePerde: 'O cadastro das paradas do caminho. Os roteiros já montados continuam valendo.' },
  { chave: 'materias-primas', rotulo: 'Matérias-primas', rota: '/materias-primas', grupo: 'cadastros',
    oQuePerde: 'O estoque de argila, esmalte e embalagem, e os avisos de compra.' },
  { chave: 'usuarios', rotulo: 'Usuários', rota: '/usuarios', grupo: 'sistema', somenteAdmin: true,
    oQuePerde: 'O controle de quem entra no sistema e com qual permissão.' },
  { chave: 'ajustes', rotulo: 'Ajustes', rota: '/ajustes', grupo: 'sistema', essencial: true,
    oQuePerde: 'A troca da própria senha. Desligar trancaria todo mundo do lado de fora.' },
]

export const CHAVES_DE_MODULO = MODULOS.map((m) => m.chave)

export function moduloPorChave(chave: string): Modulo | undefined {
  return MODULOS.find((m) => m.chave === chave)
}

/**
 * Qual módulo responde por uma rota da API.
 *
 * Não é 1-para-1 de propósito: `/lotes` alimenta o quadro, o histórico e os
 * dois estoques. Quando uma rota serve mais de um módulo, basta a pessoa ter
 * UM deles para passar — barrar quem tem o histórico porque não tem o quadro
 * quebraria a tela que ela tem direito de ver.
 */
export const MODULOS_POR_ROTA: Readonly<Record<string, readonly string[]>> = {
  // rotas de tela única
  planejamento: ['planejamento'],
  agenda: ['meu-dia'],
  folgas: ['meu-dia'],
  queimas: ['forno'],
  encomendas: ['encomendas'],
  fotos: ['fotos'],
  vendas: ['vendas'],
  precos: ['precos'],
  canais: ['canais'],

  // rotas COMPARTILHADAS: quem lê /cores não é só a tela de Esmaltes — é o
  // quadro (chip do lote), o cadastro de peças (esmaltes possíveis), a fila de
  // fotos, o histórico. Mapear 1-para-1 barraria a tela ESSENCIAL de quem
  // apenas desligou um cadastro que nem sabia que era usado por ela.
  lotes: ['producao', 'historico', 'estoque-biscoito', 'estoque-prontas'],
  estoque: ['estoque-biscoito', 'estoque-prontas'],
  pecas: ['pecas', 'planejamento', 'producao', 'historico', 'precos', 'vendas', 'encomendas', 'fotos', 'estoque-biscoito', 'estoque-prontas'],
  cores: ['esmaltes', 'pecas', 'producao', 'historico', 'fotos', 'encomendas', 'estoque-prontas'],
  etapas: ['etapas', 'pecas', 'producao', 'historico', 'forno'],
  responsaveis: ['responsaveis', 'pecas', 'producao', 'meu-dia', 'forno'],
  categorias: ['categorias', 'pecas', 'inicio'],
  'materias-primas': ['materias-primas', 'planejamento'],

  // administração dos próprios módulos: nunca pode ficar de fora do mapa,
  // senão a rota que liga e desliga tudo é a única sem tranca
  modulos: ['ajustes'],
  papeis: ['usuarios'],
  usuarios: ['usuarios'],
}

/**
 * O que esta pessoa enxerga, considerando o que o ateliê ligou e o que o papel
 * dela permite.
 *
 * A ordem das regras importa:
 *   1. papel SEM lista de módulos vê tudo. É o estado de hoje, e mudar isso em
 *      silêncio trancaria todo mundo para fora no dia do deploy.
 *   2. papel COM lista vê o que está nela, mais os essenciais — que ninguém
 *      perde, nem por engano de configuração.
 *   3. módulo desligado no ateliê some para todos, inclusive administrador.
 *   4. módulo de administrador continua só para administrador.
 */
export function modulosVisiveis(
  desligados: readonly string[],
  permissoesDoPapel: unknown,
  admin: boolean,
): Modulo[] {
  const fora = new Set(desligados)
  const doPapel = listaDoPapel(permissoesDoPapel)
  return MODULOS.filter((m) => {
    if (fora.has(m.chave) && !m.essencial) return false
    if (m.somenteAdmin && !admin) return false
    if (!doPapel) return true
    return m.essencial === true || doPapel.has(m.chave)
  })
}

/** `null` quer dizer "este papel não restringe nada". */
export function listaDoPapel(permissoes: unknown): Set<string> | null {
  if (typeof permissoes !== 'object' || permissoes === null) return null
  const bruto = (permissoes as { modulos?: unknown }).modulos
  if (!Array.isArray(bruto)) return null
  return new Set(bruto.filter((x): x is string => typeof x === 'string'))
}

export function podeVerModulo(
  chave: string,
  desligados: readonly string[],
  permissoesDoPapel: unknown,
  admin: boolean,
): boolean {
  return modulosVisiveis(desligados, permissoesDoPapel, admin).some((m) => m.chave === chave)
}
