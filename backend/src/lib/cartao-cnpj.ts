/**
 * O CARTÃO CNPJ DA RECEITA, LIDO SEM DIGITAÇÃO.
 *
 * A Gabi cadastra empresa por empresa à mão, copiando de um PDF que já tem
 * tudo. O comprovante de inscrição da Receita é um formulário fixo: rótulo em
 * caixa alta numa linha, valor na linha de baixo, campos lado a lado alinhados
 * por coluna. Isso é o bastante para preencher o cadastro inteiro.
 *
 * POR QUE NÃO É REGEX SOBRE O TEXTO TODO.
 *
 * Alguns campos têm formato reconhecível sozinho: CNPJ, CEP, e-mail, data.
 * Mas "NOVO HAMBURGO" e "RIO BRANCO" são só palavras — o que diz qual é o
 * município e qual é o bairro é a POSIÇÃO na linha, embaixo do respectivo
 * rótulo. Por isso a leitura é por coluna, e não por padrão de texto.
 *
 * E POR QUE A COLUNA NÃO É POSIÇÃO FIXA.
 *
 * A largura de cada coluna muda de um cartão para outro: o extrator alarga a
 * coluna conforme o conteúdo, então "MUNICÍPIO" começa na coluna 64 num
 * documento e na 61 no outro. Casar por posição exata quebraria no segundo
 * cartão. Aqui cada valor é atribuído ao rótulo MAIS PRÓXIMO acima dele, o que
 * tolera o deslocamento sem confundir campos vizinhos.
 *
 * O parser é tolerante de propósito: campo que não deu para ler volta nulo, e
 * a tela mostra tudo para conferência antes de salvar. Preencher errado em
 * silêncio seria pior do que não preencher.
 */

export type CartaoCnpj = {
  cnpj: string | null
  /** MATRIZ ou FILIAL */
  tipoEstabelecimento: string | null
  dataAbertura: string | null
  razaoSocial: string | null
  nomeFantasia: string | null
  porte: string | null
  cnaePrincipal: string | null
  cnaeSecundarios: string[]
  naturezaJuridica: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  cep: string | null
  bairro: string | null
  municipio: string | null
  uf: string | null
  email: string | null
  telefone: string | null
  /** ATIVA, BAIXADA, SUSPENSA, INAPTA */
  situacaoCadastral: string | null
  dataSituacao: string | null
}

const VAZIO: CartaoCnpj = {
  cnpj: null,
  tipoEstabelecimento: null,
  dataAbertura: null,
  razaoSocial: null,
  nomeFantasia: null,
  porte: null,
  cnaePrincipal: null,
  cnaeSecundarios: [],
  naturezaJuridica: null,
  logradouro: null,
  numero: null,
  complemento: null,
  cep: null,
  bairro: null,
  municipio: null,
  uf: null,
  email: null,
  telefone: null,
  situacaoCadastral: null,
  dataSituacao: null,
}

/**
 * O texto extraído é mesmo um cartão CNPJ?
 *
 * Vale a pena perguntar antes de tentar ler: sem isso, arrastar o PDF errado
 * devolveria um formulário com dois campos preenchidos por coincidência e
 * nenhum aviso, e a pessoa salvaria um cadastro inventado.
 */
export function pareceCartaoCnpj(texto: string): boolean {
  const t = semAcento(texto).toUpperCase()
  return (
    t.includes('CADASTRO NACIONAL DA PESSOA JURIDICA') &&
    t.includes('NUMERO DE INSCRICAO') &&
    /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(texto)
  )
}

export function lerCartaoCnpj(texto: string): CartaoCnpj {
  const linhas = texto.replace(/\r/g, '').split('\n')
  const dados: CartaoCnpj = { ...VAZIO, cnaeSecundarios: [] }

  /*
   * O CNPJ sai por padrão de texto, não por coluna.
   *
   * A linha dele é a mais bagunçada do documento: o extrator mistura o título
   * "COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL" com o número e com a
   * data de abertura, em ordens diferentes conforme a largura da página. O
   * formato do CNPJ, por outro lado, não aparece em nenhum outro lugar do
   * cartão — é âncora segura.
   */
  dados.cnpj = primeiro(texto, /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    const rotulos = rotulosNaLinha(linha)
    if (rotulos.length === 0) {
      /*
       * MATRIZ/FILIAL não tem rótulo em cima e NÃO está sozinho na linha: ele
       * divide espaço com a palavra "CADASTRAL", que é o fim do título
       * "COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL" que o extrator
       * quebrou ao meio. Por isso a busca é por célula, e não pela linha
       * inteira.
       */
      for (const celula of celulasDaLinha(linha)) {
        const palavra = celula.texto.trim().toUpperCase()
        if (palavra === 'MATRIZ' || palavra === 'FILIAL') dados.tipoEstabelecimento = palavra
      }
      continue
    }

    /*
     * O rótulo de bloco ocupa a linha inteira e o valor vem embaixo, também
     * inteiro: é o caso de razão social, CNAE e natureza jurídica, onde o
     * conteúdo tem espaços e traços e não se deixa fatiar por coluna.
     */
    const soUm = rotulos.length === 1
    const abaixo = proximaComTexto(linhas, i)

    if (soUm && rotulos[0].campo === 'razaoSocial') {
      dados.razaoSocial = limpar(abaixo?.texto)
      continue
    }
    if (soUm && rotulos[0].campo === 'cnaePrincipal') {
      dados.cnaePrincipal = limpar(abaixo?.texto)
      continue
    }
    if (soUm && rotulos[0].campo === 'naturezaJuridica') {
      dados.naturezaJuridica = limpar(abaixo?.texto)
      continue
    }
    if (soUm && rotulos[0].campo === 'cnaeSecundarios') {
      // são várias, uma por linha, até bater no próximo rótulo
      for (let j = i + 1; j < linhas.length; j++) {
        const conteudo = linhas[j].trim()
        if (!conteudo) continue
        if (rotulosNaLinha(linhas[j]).length > 0) break
        const valor = limpar(conteudo)
        if (valor) dados.cnaeSecundarios.push(valor)
      }
      continue
    }

    // demais campos: valores em colunas, cada um sob o seu rótulo
    if (!abaixo) continue
    for (const { campo, valor } of casarColunas(rotulos, abaixo.texto)) {
      atribuir(dados, campo, valor)
    }
  }

  return dados
}

// ── rótulos do formulário ────────────────────────────────────────────────────

type Campo = keyof CartaoCnpj

/*
 * Comparados SEM acento e em caixa alta.
 *
 * Extrator de PDF é imprevisível com acento: o mesmo "MUNICÍPIO" pode sair com
 * o acento em caractere combinante, e a comparação literal falharia sem que
 * nada na tela explicasse por quê.
 */
const ROTULOS: readonly { texto: string; campo: Campo }[] = [
  { texto: 'DATA DE ABERTURA', campo: 'dataAbertura' },
  { texto: 'NOME EMPRESARIAL', campo: 'razaoSocial' },
  { texto: 'TITULO DO ESTABELECIMENTO (NOME DE FANTASIA)', campo: 'nomeFantasia' },
  { texto: 'PORTE', campo: 'porte' },
  { texto: 'CODIGO E DESCRICAO DA ATIVIDADE ECONOMICA PRINCIPAL', campo: 'cnaePrincipal' },
  { texto: 'CODIGO E DESCRICAO DAS ATIVIDADES ECONOMICAS SECUNDARIAS', campo: 'cnaeSecundarios' },
  { texto: 'CODIGO E DESCRICAO DA NATUREZA JURIDICA', campo: 'naturezaJuridica' },
  { texto: 'LOGRADOURO', campo: 'logradouro' },
  { texto: 'NUMERO', campo: 'numero' },
  { texto: 'COMPLEMENTO', campo: 'complemento' },
  { texto: 'CEP', campo: 'cep' },
  { texto: 'BAIRRO/DISTRITO', campo: 'bairro' },
  { texto: 'MUNICIPIO', campo: 'municipio' },
  { texto: 'UF', campo: 'uf' },
  { texto: 'ENDERECO ELETRONICO', campo: 'email' },
  { texto: 'TELEFONE', campo: 'telefone' },
  { texto: 'SITUACAO CADASTRAL', campo: 'situacaoCadastral' },
  { texto: 'DATA DA SITUACAO CADASTRAL', campo: 'dataSituacao' },
]

/*
 * Rótulos que são prefixo de outros precisam ser testados na ordem mais longa
 * primeiro: "SITUACAO CADASTRAL" casaria dentro de "DATA DA SITUACAO
 * CADASTRAL" e roubaria o campo. "NUMERO" tem o mesmo problema com "NUMERO DE
 * INSCRICAO", que não está na lista justamente porque o CNPJ sai por regex.
 */
const POR_TAMANHO = [...ROTULOS].sort((a, b) => b.texto.length - a.texto.length)

type RotuloAchado = { campo: Campo; inicio: number }

function rotulosNaLinha(linha: string): RotuloAchado[] {
  const alvo = semAcento(linha).toUpperCase()
  const achados: RotuloAchado[] = []
  const ocupado: boolean[] = new Array(alvo.length).fill(false)

  for (const { texto, campo } of POR_TAMANHO) {
    let de = 0
    for (;;) {
      const em = alvo.indexOf(texto, de)
      if (em === -1) break
      de = em + texto.length
      // pedaço já reclamado por um rótulo mais longo não conta de novo
      if (ocupado.slice(em, em + texto.length).some(Boolean)) continue
      if (!isolado(alvo, em, texto.length)) continue
      for (let k = em; k < em + texto.length; k++) ocupado[k] = true
      achados.push({ campo, inicio: em })
    }
  }
  return achados.sort((a, b) => a.inicio - b.inicio)
}

/** O rótulo tem que ser palavra inteira: "UF" não pode casar dentro de "UFRGS". */
function isolado(texto: string, em: number, tamanho: number): boolean {
  const antes = em === 0 ? ' ' : texto[em - 1]
  const depois = em + tamanho >= texto.length ? ' ' : texto[em + tamanho]
  return !/[A-Z0-9]/.test(antes) && !/[A-Z0-9]/.test(depois)
}

// ── colunas ──────────────────────────────────────────────────────────────────

type Celula = { texto: string; inicio: number }

/**
 * Quebra uma linha nas colunas visuais.
 *
 * Duas ou mais casas de espaço separam colunas; uma só é espaço de palavra. É
 * o que permite manter "NOVO HAMBURGO" inteiro e ainda assim separá-lo de
 * "RS", que está do outro lado da linha.
 */
export function celulasDaLinha(linha: string): Celula[] {
  const celulas: Celula[] = []
  const padrao = /\S(?:.*?\S)?(?=\s{2,}|$)/g
  let achado: RegExpExecArray | null
  while ((achado = padrao.exec(linha)) !== null) {
    if (achado[0].trim()) celulas.push({ texto: achado[0], inicio: achado.index })
    if (padrao.lastIndex === achado.index) padrao.lastIndex++
  }
  return celulas
}

/**
 * Atribui cada valor ao rótulo de cima mais próximo.
 *
 * A distância é medida do início de um ao início do outro. Empate não acontece
 * na prática porque as colunas do cartão são largas; se acontecesse, ganha o
 * primeiro, que é o da esquerda.
 */
function casarColunas(rotulos: RotuloAchado[], linhaDeValores: string): { campo: Campo; valor: string }[] {
  const saida: { campo: Campo; valor: string }[] = []
  const usados = new Set<Campo>()

  for (const celula of celulasDaLinha(linhaDeValores)) {
    let melhor: RotuloAchado | null = null
    let menorDistancia = Infinity
    for (const rotulo of rotulos) {
      if (usados.has(rotulo.campo)) continue
      const distancia = Math.abs(rotulo.inicio - celula.inicio)
      if (distancia < menorDistancia) {
        menorDistancia = distancia
        melhor = rotulo
      }
    }
    if (!melhor) continue
    const valor = limpar(celula.texto)
    usados.add(melhor.campo)
    if (valor) saida.push({ campo: melhor.campo, valor })
  }
  return saida
}

function atribuir(dados: CartaoCnpj, campo: Campo, valor: string) {
  if (campo === 'cnaeSecundarios') return
  if (campo === 'telefone') {
    dados.telefone = primeiroTelefoneUtil(valor)
    return
  }
  if (campo === 'uf') {
    // UF é sempre duas letras; qualquer outra coisa na coluna é engano do
    // extrator, e uma sigla errada estraga o endereço inteiro
    dados.uf = /^[A-Za-z]{2}$/.test(valor) ? valor.toUpperCase() : null
    return
  }
  ;(dados as Record<Campo, unknown>)[campo] = valor
}

// ── limpeza ──────────────────────────────────────────────────────────────────

/**
 * Asterisco é como o cartão escreve "em branco".
 *
 * `COMPLEMENTO ********` não quer dizer que o complemento é uma fileira de
 * asteriscos. Sem isso, o endereço do cliente sairia com lixo impresso na
 * ordem de produção.
 */
function limpar(valor: string | undefined): string | null {
  if (!valor) return null
  const texto = valor.trim().replace(/\s+/g, ' ')
  if (!texto) return null
  if (/^\*+$/.test(texto)) return null
  return texto
}

/**
 * O cartão às vezes traz dois telefones separados por barra, e o segundo é um
 * lugar-vazio: `(51) 9323-9428 / (0000) 0000-0000`. Guardar isso inteiro
 * deixaria o WhatsApp do fornecedor impossível de discar.
 */
function primeiroTelefoneUtil(valor: string): string | null {
  for (const parte of valor.split('/')) {
    const numero = parte.trim()
    if (!numero) continue
    const digitos = numero.replace(/\D/g, '')
    if (digitos.length < 10) continue
    if (/^0+$/.test(digitos)) continue
    return numero
  }
  return null
}

function primeiro(texto: string, padrao: RegExp): string | null {
  return texto.match(padrao)?.[0] ?? null
}

function proximaComTexto(linhas: string[], depoisDe: number): { texto: string; indice: number } | null {
  for (let i = depoisDe + 1; i < linhas.length; i++) {
    if (linhas[i].trim()) return { texto: linhas[i], indice: i }
  }
  return null
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// ── o que a tela recebe ──────────────────────────────────────────────────────

export type CadastroDoCartao = {
  nome: string | null
  documento: string | null
  endereco: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  email: string | null
  telefone: string | null
  atividade: string | null
  porte: string | null
  situacao: string | null
  dataAbertura: string | null
  /** o que não coube em campo próprio, pronto para a observação */
  observacao: string | null
}

/**
 * Traduz o cartão para os campos do cadastro.
 *
 * O NOME usa o fantasia quando existe: é assim que o ateliê chama o cliente no
 * dia a dia. "CERAMICA VERA FLESCH" é reconhecível; "CERAMICA VERA FLESCH
 * LTDA" é o que está no contrato social e ninguém fala. A razão social não se
 * perde — vai para a observação, que é onde ela é útil na hora de emitir nota.
 */
export function cadastroDoCartao(cartao: CartaoCnpj): CadastroDoCartao {
  const razao = cartao.razaoSocial
  const fantasia = cartao.nomeFantasia
  const nome = fantasia ?? razao

  const endereco = [cartao.logradouro, cartao.numero].filter(Boolean).join(', ') || null
  const comComplemento = cartao.complemento ? `${endereco ?? ''} - ${cartao.complemento}`.trim() : endereco

  const notas: string[] = []
  if (fantasia && razao && fantasia !== razao) notas.push(`Razão social: ${razao}`)
  if (cartao.cnaeSecundarios.length > 0) {
    notas.push(`Atividades secundárias: ${cartao.cnaeSecundarios.join(' · ')}`)
  }
  if (cartao.naturezaJuridica) notas.push(`Natureza jurídica: ${cartao.naturezaJuridica}`)

  return {
    nome,
    documento: cartao.cnpj,
    endereco: comComplemento,
    bairro: cartao.bairro,
    cidade: cartao.municipio,
    uf: cartao.uf,
    cep: cartao.cep,
    email: cartao.email ? cartao.email.toLowerCase() : null,
    telefone: cartao.telefone,
    atividade: cartao.cnaePrincipal,
    porte: cartao.porte,
    situacao: cartao.situacaoCadastral,
    dataAbertura: cartao.dataAbertura,
    observacao: notas.length > 0 ? notas.join('\n') : null,
  }
}
