import { describe, expect, it } from 'vitest'
import { comAuth } from './helpers'

/**
 * Cliente e fornecedor pela API: cartão CNPJ lido, documento único, e
 * encomenda nova ligada sozinha ao cliente de mesmo nome.
 */
// o mesmo cartão real que o e2e usa, copiado: a bateria do backend roda sem a pasta e2e
const cartao = `                                         REPÚBLICA FEDERATIVA DO BRASIL\n\n\n                                CADASTRO NACIONAL DA PESSOA JURÍDICA\n\n     NÚMERO DE INSCRIÇÃO\n     46.370.338/0001-36\n                                     COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO DATA DE ABERTURA\n                                                                            12/05/2022\n     MATRIZ                                       CADASTRAL\n\n     NOME EMPRESARIAL\n     CERAMICA VERA FLESCH LTDA\n\n     TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)                                                                    PORTE\n     CERAMICA VERA FLESCH                                                                                            ME\n\n     CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL\n     23.49-4-99 - Fabricação de produtos cerâmicos não-refratários não especificados anteriormente\n\n     CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS\n     47.59-8-99 - Comércio varejista de outros artigos de uso pessoal e doméstico não especificados anteriormente\n     47.89-0-03 - Comércio varejista de objetos de arte\n\n     CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA\n     206-2 - Sociedade Empresária Limitada\n\n     LOGRADOURO                                                    NÚMERO           COMPLEMENTO\n     R PADRE JOSE MAURICIO                                         156              ********\n\n     CEP                       BAIRRO/DISTRITO                     MUNICÍPIO                                           UF\n     93.310-290                RIO BRANCO                          NOVO HAMBURGO                                       RS\n\n     ENDEREÇO ELETRÔNICO                                           TELEFONE\n     JOAO@CERAMICAVF.COM.BR                                        (51) 8131-0197\n\n     ENTE FEDERATIVO RESPONSÁVEL (EFR)\n     *****\n\n     SITUAÇÃO CADASTRAL                                                                        DATA DA SITUAÇÃO CADASTRAL\n     ATIVA                                                                                     12/05/2022\n\n     MOTIVO DE SITUAÇÃO CADASTRAL`

describe('clientes e fornecedores', () => {
  it('lê o cartão CNPJ sem gravar nada', async () => {
    const r = await comAuth('post', '/clientes/ler-cartao', { texto: cartao })
    expect(r.status).toBe(200)
    expect(r.body.cadastro.documento).toMatch(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)
    expect(r.body.cadastro.nome).toBeTruthy()
  })

  it('texto que não é cartão é recusado com mensagem em português', async () => {
    const r = await comAuth('post', '/fornecedores/ler-cartao', { texto: 'lista de compras: argila, esmalte, caixas' })
    expect(r.status).toBe(422)
    expect(r.body.mensagem).toContain('não é um cartão CNPJ')
  })

  it('cria, recusa documento repetido e lista pela busca sem acento', async () => {
    const a = await comAuth('post', '/clientes', { nome: 'Loja Xícara Teste', documento: '11.222.333/0001-81' })
    expect(a.status).toBe(201)
    expect(a.body.nome).toBe('LOJA XÍCARA TESTE')
    const b = await comAuth('post', '/clientes', { nome: 'Outra', documento: '11222333000181' })
    expect(b.status).toBe(409)
    const lista = await comAuth('get', '/clientes?busca=xicara')
    expect(lista.body.some((c: { nome: string }) => c.nome === 'LOJA XÍCARA TESTE')).toBe(true)
  })

  it('encomenda com o nome de um cliente cadastrado fica ligada a ele, e o cliente não pode ser apagado', async () => {
    const c = await comAuth('post', '/clientes', { nome: 'Cafeteria Vínculo' })
    const pecas = await comAuth('get', '/pecas?ativo=true')
    const enc = await comAuth('post', '/encomendas', {
      cliente: 'CAFETERIA VINCULO',
      itens: [{ pecaId: pecas.body[0].id, quantidade: 2 }],
    })
    expect(enc.status).toBe(201)
    const del = await comAuth('delete', `/clientes/${c.body.id}`)
    expect(del.status).toBe(409)
    expect(del.body.mensagem).toContain('Desative')
  })
})
