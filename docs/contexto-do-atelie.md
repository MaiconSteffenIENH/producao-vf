# Contexto do ateliê: o que existe sobre a Vera Flesch fora do sistema

Levantamento feito em 14/09/2026 a partir do que está público na internet,
cruzado com o que o sistema já cadastra. Serve para quem mexe no código
entender o negócio que ele atende, e para não modelar de cabeça o que o
ateliê já diz em público. Fonte de cada afirmação no fim.

## Quem é

- Vera Flesch trabalha com artesanato há 35 anos. A cerâmica começou como
  hobby em 2013 e virou profissão (perfil na AVIWA). O Instagram fala em
  "14+ anos produzindo", então há duas contagens circulando.
- Empresa: CERAMICA VERA FLESCH LTDA, CNPJ 46.370.338/0001-36, porte ME,
  aberta em 12/05/2022. Sociedade Empresária Limitada.
- CNAE principal 23.49-4-99 (fabricação de produtos cerâmicos não
  refratários); secundários 47.59-8-99 (varejo de artigos de uso pessoal e
  doméstico) e 47.89-0-03 (varejo de objetos de arte).
- Dois endereços em Novo Hamburgo: o do CNPJ é Rua Padre José Maurício 156,
  Rio Branco; o do site é Rua José João Martins 256, Guarani. Provavelmente
  sede fiscal e ateliê. Confirmar com a Gabi antes de usar qualquer um dos
  dois em documento.
- Instagram @ceramicaveraflesch: 11,1 mil seguidores, perfil verificado.
  Bio: "Cerâmica Autoral, alta temperatura, do home decor à mesa posta,
  peças artesanais para todos os dias, ateliê e cursos presenciais".
  Destaques: Cursos, Peças Personalizadas, Lojas Parceiras, VF pelo Brasil,
  Produção, Depoimentos, Lojistas.
- O site diz que cada peça leva cerca de 30 dias, seca naturalmente, passa
  por duas queimas e usa esmaltes atóxicos. É exatamente o ciclo que o
  sistema modela (decisão estrutural 2 do CLAUDE.md).

## Canais de venda

O sistema cadastra três canais (loja própria, Mercado Livre, Shopee). Na
prática há mais:

| canal | o que vende | observação |
|---|---|---|
| Loja própria ceramicavf.com.br (Nuvemshop) | mesa posta: bowls, café, manteigueira francesa, pratos, saladeiras, utilitários | ~40 produtos; frete grátis; 4x sem juros; 10% no Pix ou boleto |
| Shopee, loja `vf.ceramica` | mesma linha | link principal da bio do Instagram; catálogo não visível sem login |
| AVIWA (plataforma para arquitetos, São Leopoldo) | vasos decorativos "Apollo" | par a R$ 660, "peças ilimitadas", bloco 3D para projeto |
| Plantô Arte Botânica (Chapecó, SC) | linha exclusiva "Casa Plantô por Vera Flesch": 24 vasos numerados | R$ 499 a R$ 1.249 cada; canal lojista, peça decorativa |
| Feiras e oficinas | Brique na Estação (Hamburgo Velho), oficinas de cerâmica em 2019 | eventual |
| Cursos presenciais no ateliê | receita que o sistema não modela, e não precisa | |

## Preços na loja própria (setembro de 2026)

Copinho de café R$ 49 · xícara de cafezinho R$ 69 · prato de pão R$ 107 ·
açucareiro R$ 129 · prato de refeição R$ 143 · conjunto xícara e passador
R$ 153 · manteigueira francesa e bowl recortado R$ 159 · bule R$ 218 ·
saladeira R$ 239 · bowl R$ 283.

Cores no site: Pistache, Azul Água Marinho, Violeta, Areia, Branco, Preto,
Pedra Sabão.

Boa parte do catálogo estava "Esgotado" ou "última peça" na data do
levantamento. É o sintoma que o sistema veio atacar: sem número de quanto
falta, a loja fica vazia enquanto o estoque parado é de outra peça.

## O que isso muda para o sistema

1. **Apelido de cor no importador de vendas.** O site vende "Manteigueira
   Francesa Pedra Sabão" com slug `manteigueira-francesa-areia`: a cor foi
   renomeada na loja, mas o nome antigo sobrevive na URL e provavelmente na
   planilha exportada. Sem apelido (Areia = Pedra Sabão), a cobertura divide
   a mesma cor em duas e nenhuma atinge o mínimo. Conferir com a Gabi se
   "Areia" ainda existe como cor própria ou se virou Pedra Sabão.
2. **Bowl tem três tamanhos num produto só** (P 13 cm, M 14 cm, G 16 cm; 290,
   390 e 490 g). No sistema é uma peça. Se a produção trata os três como
   peças diferentes (roteiro igual, mas biscoito e mínimo separados), cabe
   cadastrar BOWL P, M e G.
3. **Há uma linha decorativa** (vasos para Plantô e AVIWA) fora do catálogo do
   sistema. É venda B2B com prazo, o caso de uso do módulo de Encomendas e do
   cadastro de Clientes que está em teste.
4. **Lojistas são um canal com taxa própria**, diferente de marketplace e de
   loja própria. Vale um canal "Lojistas" na tela de Preços por canal quando
   a Gabi confirmar a margem praticada.

## Fontes

- Instagram: https://www.instagram.com/ceramicaveraflesch/
- Loja própria: https://ceramicavf.com.br/ (produtos em /produtos/ e
  /produtos/page/2/; Bowl Pistache em /produtos/bowl-pistache/)
- AVIWA, perfil: https://www.aviwa.com.br/artista/vera-flesch
- AVIWA, Conjunto Apollo: https://www.aviwa.com.br/product-page/conjunto-apollo
- Plantô, Cerâmica Autoral: https://www.plantoartebotanica.com.br/exclusivosceramica
- Portal Martin Behrend, Brique na Estação (09/06/2019):
  https://martinbehrend.com.br/novo-hamburgo/confirmado-brique-na-estacao-tem-mais-uma-edicao-em-hamburgo-velho
- Cartão CNPJ da Receita Federal (o mesmo usado nos testes do leitor de CNPJ)
