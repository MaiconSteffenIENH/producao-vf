import { describe, expect, it } from 'vitest'
import {
  cadastroDoCartao,
  celulasDaLinha,
  lerCartaoCnpj,
  pareceCartaoCnpj,
} from '../../src/lib/cartao-cnpj'

/*
 * OS DOIS CARTÕES SÃO REAIS, copiados do PDF que a Receita emite.
 *
 * Eles não são iguais de propósito: as colunas têm larguras diferentes, um tem
 * complemento e o outro não, um tem dois telefones e o outro um, um tem duas
 * atividades secundárias e o outro uma. Um parser que só acerta o primeiro
 * passa despercebido até a Gabi importar o segundo cadastro.
 *
 * O espaçamento é significativo: é ele que diz qual valor pertence a qual
 * coluna. Não reformate estas strings.
 */

const CERAMICA = `
                                         REPÚBLICA FEDERATIVA DO BRASIL


                                CADASTRO NACIONAL DA PESSOA JURÍDICA

     NÚMERO DE INSCRIÇÃO
     46.370.338/0001-36
                                     COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO DATA DE ABERTURA
                                                                            12/05/2022
     MATRIZ                                       CADASTRAL

     NOME EMPRESARIAL
     CERAMICA VERA FLESCH LTDA

     TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)                                                                    PORTE
     CERAMICA VERA FLESCH                                                                                            ME

     CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL
     23.49-4-99 - Fabricação de produtos cerâmicos não-refratários não especificados anteriormente

     CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS
     47.59-8-99 - Comércio varejista de outros artigos de uso pessoal e doméstico não especificados anteriormente
     47.89-0-03 - Comércio varejista de objetos de arte

     CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA
     206-2 - Sociedade Empresária Limitada

     LOGRADOURO                                                    NÚMERO           COMPLEMENTO
     R PADRE JOSE MAURICIO                                         156              ********

     CEP                       BAIRRO/DISTRITO                     MUNICÍPIO                                           UF
     93.310-290                RIO BRANCO                          NOVO HAMBURGO                                       RS

     ENDEREÇO ELETRÔNICO                                           TELEFONE
     JOAO@CERAMICAVF.COM.BR                                        (51) 8131-0197

     ENTE FEDERATIVO RESPONSÁVEL (EFR)
     *****

     SITUAÇÃO CADASTRAL                                                                        DATA DA SITUAÇÃO CADASTRAL
     ATIVA                                                                                     12/05/2022

     MOTIVO DE SITUAÇÃO CADASTRAL`

const NEXA = `
                                         REPÚBLICA FEDERATIVA DO BRASIL


                                CADASTRO NACIONAL DA PESSOA JURÍDICA

     NÚMERO DE INSCRIÇÃO
     68.591.730/0001-48
                                     COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO DATA DE ABERTURA
                                                                            14/08/2026
     MATRIZ                                       CADASTRAL

     NOME EMPRESARIAL
     GABRIELE FLESCH STEFFEN LTDA

     TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)                                                               PORTE
     NEXA DIGITAL                                                                                               ME

     CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL
     73.19-0-03 - Marketing direto

     CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS
     73.19-0-02 - Promoção de vendas

     CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA
     206-2 - Sociedade Empresária Limitada

     LOGRADOURO                                                 NÚMERO          COMPLEMENTO
     R BORGES DE MEDEIROS                                       500             APT 13

     CEP                       BAIRRO/DISTRITO                  MUNICÍPIO                                         UF
     93.310-280                RIO BRANCO                       NOVO HAMBURGO                                     RS

     ENDEREÇO ELETRÔNICO                                        TELEFONE
     GABIFSTEFFEN87@GMAIL.COM                                   (51) 9323-9428 / (0000) 0000-0000

     ENTE FEDERATIVO RESPONSÁVEL (EFR)
     *****

     SITUAÇÃO CADASTRAL                                                                   DATA DA SITUAÇÃO CADASTRAL
     ATIVA                                                                                14/08/2026

     MOTIVO DE SITUAÇÃO CADASTRAL`

describe('reconhecer o documento', () => {
  it('aceita os dois cartões', () => {
    expect(pareceCartaoCnpj(CERAMICA)).toBe(true)
    expect(pareceCartaoCnpj(NEXA)).toBe(true)
  })

  it('recusa outro PDF qualquer', () => {
    expect(pareceCartaoCnpj('Nota fiscal 123 - Sinos Tintas - R$ 240,00')).toBe(false)
  })

  it('recusa cartão sem CNPJ legível: sem número não há cadastro', () => {
    expect(pareceCartaoCnpj(CERAMICA.replace('46.370.338/0001-36', '######'))).toBe(false)
  })
})

describe('cartão da Cerâmica Vera Flesch', () => {
  const c = lerCartaoCnpj(CERAMICA)

  it('identifica a empresa', () => {
    expect(c.cnpj).toBe('46.370.338/0001-36')
    expect(c.tipoEstabelecimento).toBe('MATRIZ')
    expect(c.razaoSocial).toBe('CERAMICA VERA FLESCH LTDA')
    expect(c.nomeFantasia).toBe('CERAMICA VERA FLESCH')
    expect(c.porte).toBe('ME')
    expect(c.dataAbertura).toBe('12/05/2022')
  })

  it('lê o endereço coluna a coluna', () => {
    expect(c.logradouro).toBe('R PADRE JOSE MAURICIO')
    expect(c.numero).toBe('156')
    expect(c.cep).toBe('93.310-290')
    expect(c.bairro).toBe('RIO BRANCO')
    expect(c.municipio).toBe('NOVO HAMBURGO')
    expect(c.uf).toBe('RS')
  })

  it('asterisco é campo em branco, não conteúdo', () => {
    expect(c.complemento).toBeNull()
  })

  it('lê contato e situação', () => {
    expect(c.email).toBe('JOAO@CERAMICAVF.COM.BR')
    expect(c.telefone).toBe('(51) 8131-0197')
    expect(c.situacaoCadastral).toBe('ATIVA')
    expect(c.dataSituacao).toBe('12/05/2022')
  })

  it('lê a atividade principal e as duas secundárias', () => {
    expect(c.cnaePrincipal).toBe(
      '23.49-4-99 - Fabricação de produtos cerâmicos não-refratários não especificados anteriormente',
    )
    expect(c.cnaeSecundarios).toHaveLength(2)
    expect(c.cnaeSecundarios[1]).toBe('47.89-0-03 - Comércio varejista de objetos de arte')
    expect(c.naturezaJuridica).toBe('206-2 - Sociedade Empresária Limitada')
  })
})

describe('cartão da Nexa Digital — colunas mais estreitas', () => {
  const c = lerCartaoCnpj(NEXA)

  it('identifica a empresa', () => {
    expect(c.cnpj).toBe('68.591.730/0001-48')
    expect(c.razaoSocial).toBe('GABRIELE FLESCH STEFFEN LTDA')
    expect(c.nomeFantasia).toBe('NEXA DIGITAL')
    expect(c.porte).toBe('ME')
  })

  it('lê o complemento quando ele existe', () => {
    expect(c.logradouro).toBe('R BORGES DE MEDEIROS')
    expect(c.numero).toBe('500')
    expect(c.complemento).toBe('APT 13')
  })

  it('não confunde bairro com município mesmo com a coluna deslocada', () => {
    expect(c.bairro).toBe('RIO BRANCO')
    expect(c.municipio).toBe('NOVO HAMBURGO')
    expect(c.uf).toBe('RS')
    expect(c.cep).toBe('93.310-280')
  })

  /*
   * O segundo telefone é um lugar-vazio da Receita. Guardar a linha inteira
   * deixaria o número impossível de discar no WhatsApp.
   */
  it('descarta o telefone de zeros e fica com o de verdade', () => {
    expect(c.telefone).toBe('(51) 9323-9428')
  })

  it('uma atividade secundária só', () => {
    expect(c.cnaeSecundarios).toEqual(['73.19-0-02 - Promoção de vendas'])
  })
})

describe('o que a tela recebe pronta', () => {
  it('usa o nome fantasia, que é como o ateliê chama o cliente', () => {
    const p = cadastroDoCartao(lerCartaoCnpj(CERAMICA))
    expect(p.nome).toBe('CERAMICA VERA FLESCH')
    expect(p.documento).toBe('46.370.338/0001-36')
    expect(p.cidade).toBe('NOVO HAMBURGO')
  })

  it('a razão social não se perde: vai para a observação', () => {
    const p = cadastroDoCartao(lerCartaoCnpj(CERAMICA))
    expect(p.observacao).toContain('Razão social: CERAMICA VERA FLESCH LTDA')
    expect(p.observacao).toContain('Comércio varejista de objetos de arte')
  })

  it('monta o endereço numa linha só, com o complemento quando há', () => {
    expect(cadastroDoCartao(lerCartaoCnpj(CERAMICA)).endereco).toBe('R PADRE JOSE MAURICIO, 156')
    expect(cadastroDoCartao(lerCartaoCnpj(NEXA)).endereco).toBe('R BORGES DE MEDEIROS, 500 - APT 13')
  })

  it('e-mail desce para minúscula: o cartão vem tudo em caixa alta', () => {
    expect(cadastroDoCartao(lerCartaoCnpj(NEXA)).email).toBe('gabifsteffen87@gmail.com')
  })
})

describe('quebra de linha em colunas', () => {
  it('dois espaços separam coluna, um só é espaço de palavra', () => {
    const celulas = celulasDaLinha('   93.310-280   RIO BRANCO      NOVO HAMBURGO    RS')
    expect(celulas.map((c) => c.texto)).toEqual(['93.310-280', 'RIO BRANCO', 'NOVO HAMBURGO', 'RS'])
  })

  it('linha vazia não vira célula', () => {
    expect(celulasDaLinha('        ')).toEqual([])
  })

  it('guarda onde cada coluna começa, que é o que casa valor com rótulo', () => {
    const [primeira, segunda] = celulasDaLinha('ABC     DEF')
    expect(primeira.inicio).toBe(0)
    expect(segunda.inicio).toBe(8)
  })
})

describe('cartão incompleto não inventa dado', () => {
  it('texto que não é cartão devolve tudo nulo, sem estourar', () => {
    const c = lerCartaoCnpj('linha solta\noutra linha')
    expect(c.cnpj).toBeNull()
    expect(c.razaoSocial).toBeNull()
    expect(c.cnaeSecundarios).toEqual([])
  })

  it('texto vazio devolve tudo nulo', () => {
    expect(lerCartaoCnpj('').cnpj).toBeNull()
  })
})
