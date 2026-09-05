# Backlog do ateliê

O que a equipe pediu, com data, quem pediu e a dor por trás. Item sem dor
registrada vira funcionalidade que ninguém usa: a origem é o que permite dizer
não depois, ou construir outra coisa que resolva melhor o mesmo problema.

A ordem dentro de cada bloco é a prioridade combinada, não a data.

---

## 05/09/2026 — Gabi e João

### 1. Quadro de avisos pendentes · **entregue em 05/09**

**Quem pediu:** João, através da Gabi. Marcado por eles como "extremamente
importante, começar por este".

**A dor.** Uma bandeja de tortinha de um cliente e duas xícaras coração verde de
outro ficaram para trás. Não havia estoque até a data de envio, e a Gabi e o
João tinham sinalizado na caixa de envio que a entrega sairia até sexta. O
combinado morava no quadro branco e era apagado depois, então não havia onde
consultar o que tinha sido prometido nem para quem.

O corte é das 17h: passou disso, a agência dos Correios não despacha mais no
dia, e um dia perdido é a entrega perdida.

**O que foi feito.** Quadro de avisos com texto livre e prazo opcional, e alerta
colorido no menu lateral que aparece em qualquer tela: âmbar com aviso em
aberto, vermelho com contorno no dia do prazo, vermelho sólido com pastilha
pulsando quando passou. Concluir não apaga, para o combinado continuar
consultável.

---

### 2. Cadastro de anúncio para Shopee e Mercado Livre

**Quem pediu:** Gabi. Marcado como importante e **não urgente**.

**A dor.** Hoje ela cadastra o anúncio numa plataforma externa, a UpSeller, e o
que sai de lá não conversa com a produção. O sistema já sabe peça, esmalte,
medida, peso e custo — tudo que um anúncio precisa —, e esse dado é digitado de
novo em outro lugar.

**Pontos a definir antes de começar.**

- O que exatamente a UpSeller resolve hoje que o sistema não resolveria: é o
  cadastro em si, a publicação nos dois canais, ou o controle de estoque
  compartilhado entre eles?
- Vale integrar por API (o Mercado Livre usa OAuth 2.0 e a Shopee usa chave de
  parceiro com assinatura) ou basta exportar um arquivo no formato que cada
  canal aceita?
- Sem contas de desenvolvedor aprovadas nos dois canais, a integração não sai do
  papel. Isso precisa ser encaminhado antes do código.

Esse item já está desenhado como arquitetura no *Documento de Arquitetura de
Software* (seções 11 e 12): porta de canal de venda com um adaptador por
marketplace, e o pedido recebido disparando o cálculo de necessidade de
material.

---

### 3. Cadastro de clientes

**Quem pediu:** Gabi. Marcado como importante e **não urgente**.

**A dor.** Serve de base para um site próprio, estilo marketplace, para venda
direta. A urgência é baixa porque a expansão prevista passa antes pelo TikTok
Shop, e só depois pela venda particular.

**Pontos a definir antes de começar.**

- Encomenda já tem `cliente` como texto livre. Um cadastro de verdade
  substituiria esse campo por uma referência, e isso mexe em dado que já existe.
- Guardar dado de cliente muda o assunto: passa a haver informação pessoal no
  banco, com o que isso implica de consentimento e de exclusão a pedido.

---

### 4. Compra de argila pelas datas do caminhão

**Quem pediu:** Vera, relatado pela Gabi. Marcado como **a refinar**.

**A dor.** A Vera sabe de cor quando o caminhão de argila passa e compra a mais
para não faltar insumo no meio do trabalho. Esse conhecimento não está em lugar
nenhum: se ela não estiver, ninguém sabe a data nem o quanto pedir.

**Por que ainda não virou tarefa.** O sistema já calcula o que comprar
(`lib/insumos.ts`), mas hoje ele responde "quanto falta", e não "quando pedir".
Falta o prazo de entrega do fornecedor, que é o que transforma a quantidade numa
data de emissão de compra. A fórmula está no documento de arquitetura como
`Demissão = Dnecessidade − L(i)`.

Antes de codar, é preciso saber com a Vera: o caminhão tem data fixa ou avisa
com quantos dias, e quanto tempo de argila o ateliê quer manter de folga.

Enquanto isso, a data do próximo caminhão cabe no quadro de avisos.

---

### 5. Fotos travando as vendas · **em teste na branch `melhorias/05-09`**

**Quem pediu:** Maicon, no mesmo dia.

**A dor.** O ciclo da foto (`pendente → fotografado → enviado → editado →
publicado`) nasceu de um problema real: peça pronta e não anunciada é dinheiro
parado. Mas o ateliê parou de usar a tela, e ninguém avança o status. Como o
estoque só conta como vendável o que está em "publicado", tudo ficou em
"pendente" e o número de vendáveis virou zero permanente — a tela parou de
informar qualquer coisa.

Pior: desligar o módulo em Ajustes escondia a tela e **mantinha** a trava, ou
seja, tirava do dono a única saída que ele tinha.

**O que foi feito.** Fotos desligado em Ajustes agora desliga a exigência junto:
peça pronta com esmalte conta como vendável, e a sugestão "fotografar" sai do
planejamento. O ciclo continua gravado, e religar devolve tudo.

**O que fica para depois.** Importar as fotos em vez de acompanhar o ciclo à
mão. Sem urgência definida.
