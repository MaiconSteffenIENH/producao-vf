# Roteiro de fala — 1º entregável

**Produção VF · Ateliê Vera Flesch Cerâmica**
Duração alvo: 8 a 10 minutos · 6 slides

Este roteiro é para você ler antes e falar com suas palavras, não para decorar.
O que está em **negrito** é o que não pode faltar. O resto é apoio.

---

## Slide 1 · Capa (30 segundos)

> "Boa noite. Meu nome é Maicon e vou apresentar o Produção VF, um sistema de
> planejamento e controle de produção que estou desenvolvendo para o Ateliê
> Vera Flesch Cerâmica.
>
> **O que traz aqui hoje é o primeiro entregável: o documento do projeto, com a
> empresa, o Product Backlog e o planejamento das entregas.**
>
> Um detalhe que muda como vocês vão ouvir o resto: o sistema já está em
> produção e em uso diário no ateliê. Então não é um projeto no papel."

**Não faça:** ler o slide em voz alta. Ele já está escrito.

---

## Slide 2 · A empresa e o problema (2 min 30)

**Este é o slide mais importante da apresentação.** Se a plateia entender a
cadeia dos três passos, tudo o que vem depois se explica sozinho. Fale devagar
e siga as caixas de cima para baixo, uma de cada vez.

> "O ateliê é uma microempresa de cerâmica artesanal, sete pessoas, aqui na
> região. Produzem peças utilitárias e vendem por marketplace, feira e
> encomenda.
>
> **A peça leva cerca de trinta dias e passa por duas queimas.** Guardem esse
> número, porque ele é o que torna o erro caro.
>
> O problema principal não era uma queixa solta. Era uma cadeia de três passos,
> e ela terminava sempre no mesmo lugar."

Aponte para a primeira caixa:

> "**A Gabi**, do administrativo, avisava que precisavam de determinada peça.
> Mas o pedido ia sem quantidade, porque não existia nenhum número que dissesse
> quantas faltavam de fato."

Segunda caixa:

> "**A Vera** recebia esse pedido e não tinha como saber quantas produzir. E aí
> vem a parte que eu acho mais interessante: **na dúvida, ela produzia a mais.**
> E essa é a decisão certa do ponto de vista dela — se faltar, são mais trinta
> dias para repor. Produzir a mais parece o erro barato."

Terceira caixa, e faça uma pausa aqui:

> "**Só que não é.** O excesso virava estoque parado. Peça pronta ocupando
> prateleira, com a argila, o esmalte e a queima já pagos, esperando uma venda
> que ninguém tinha previsto. E o pior: ocupou lugar no forno e tomou o tempo de
> alguém que poderia estar fazendo a peça que estava de fato vendendo."

Por último, a linha do João:

> "E tem a parte do acompanhamento. **O João controlava a produção num quadro
> branco**, que era apagado quando enchia. Então o que foi pedido não podia ser
> consultado depois: não dava para conferir, nem somar, nem responder 'quanto
> disso já saiu'. Ele me disse que precisava de duas coisas: um controle
> prático, e enxergar de forma fácil quantas peças estão em cada etapa."

**Se perguntarem "por que a cor complica?"**, esta é a resposta: a peça é
queimada uma vez ainda sem cor, e só depois se escolhe o esmalte, conforme o
que está vendendo. Então o mesmo estoque intermediário pode virar qualquer cor.
É uma vantagem de produção que nenhum sistema genérico entende.

---

## Slide 3 · O que o sistema resolve (1 min 30)

> "O sistema responde três perguntas, em qualquer ponto do dia.
>
> **Primeira: o que produzir agora.** Ele cruza o mínimo desejado com o estoque
> real e já ajusta a quantidade pela perda esperada. Se faltam cinquenta peças
> e a peça perde doze por cento, ele manda começar cinquenta e sete, não
> cinquenta.
>
> **Segunda: onde cada lote está.** Isso é um quadro de produção, mas com uma
> decisão por trás: o saldo de cada etapa não é um campo gravado, é a soma dos
> lançamentos. Como num livro-caixa. Isso significa que o número nunca discorda
> do histórico, porque ele *é* o histórico.
>
> **Terceira: quantas peças ficaram prontas** — separando o que é vendável do
> que ainda não tem foto publicada, porque peça sem foto está na prateleira e
> não está na loja."

Aponte para o quadro da direita:

> "E tão importante quanto: **o documento declara o que o sistema não é.**
> Não é financeiro, não é loja virtual, não é folha de pagamento. Escrevi isso
> porque o risco mais provável de um sistema pequeno é virar um ERP ruim por
> acréscimos que pareciam pequenos."

---

## Slide 4 · Product Backlog (2 minutos)

> "O backlog tem dezenove épicos, quarenta e nove histórias e quatrocentos e
> cinquenta pontos. **Setenta e três por cento já está entregue e em uso.**
>
> Ele foi montado de três fontes, nesta ordem: as conversas com o ateliê, o
> próprio sistema em produção, e uma leitura crítica do código — que, aliás,
> revelou uma lacuna que ninguém tinha pedido ainda.
>
> Cada história segue o padrão INVEST e tem critérios de aceite escritos em
> Dado / Quando / Então, sempre com pelo menos um caminho negativo. **É o
> caminho negativo que costuma faltar quando o software chega no ateliê.**"

Aponte para a tabela de baixo — é o ponto forte do slide:

> "Esta tabela é o que me deixa mais seguro do backlog. **Cada item nasce de uma
> dor com nome e sobrenome.** A Gabi pedia peça sem número, virou a tela que diz
> quanto produzir de cada uma. A Vera produzia a mais e sobrava estoque, virou o
> mínimo por peça com a cobertura de venda. O João usava quadro branco, virou o
> quadro de produção com histórico que não se apaga. E a última linha é de
> ontem: ele pediu uma forma de registrar a argila e as medidas de cada peça,
> porque a ficha de papel que eles usam se perdeu e tiveram que medir tudo de
> novo."

**Se perguntarem sobre a estimativa:** pontos de história em escala Fibonacci,
calibrados comparando com o esforço já observado nos itens concluídos. Ou seja,
tem base histórica, não é chute.

---

## Slide 5 · Planejamento dos entregáveis (2 minutos)

> "O planejamento tem oito sprints de duas semanas. **As quatro primeiras já
> foram executadas** e estão aqui como linha de base, com as entregas
> verificáveis em produção. As quatro seguintes são o plano.
>
> São oitenta horas planejadas, **mais vinte e cinco por cento de reserva de
> risco declarada em linha própria** — e não diluída dentro das tarefas. Ela
> existe por dois motivos concretos: o time é de uma pessoa só, então qualquer
> ausência para a sprint inteira; e o sistema está em produção, então correção
> urgente do ateliê passa na frente do plano.
>
> São doze riscos mapeados, **cada um com resposta e dono**. Risco listado sem
> resposta é decoração de documento.
>
> E os marcos são entrega verificável, não data no calendário. Ou está
> funcionando na mão do ateliê, ou não aconteceu."

**Se perguntarem por que só doze horas por semana:** é a dedicação real,
compatível com trabalho e faculdade. Prefiro um número que se cumpre a um que
impressiona.

---

## Slide 6 · Estado atual e próximos passos (1 min 30)

> "Fecho com o que me parece o ponto mais importante deste entregável.
>
> **O documento descreve um sistema que existe e roda**, não uma intenção. São
> vinte e três mil linhas de código, vinte e seis entidades no banco,
> quatrocentos e quarenta e oito testes automatizados que rodam antes de cada
> publicação, e quarenta versões publicadas.
>
> Os próximos passos já estão definidos, e o primeiro deles nasceu esta semana:
> a ficha técnica da peça, com a argila e as medidas, que é o pedido do João.
>
> E é com a frase dele que eu encerro: **'ontem perdemos uma ficha e hoje
> tivemos que medir tudo de novo'.** É exatamente esse tipo de perda invisível
> que o sistema existe para eliminar. Obrigado."

---

## Perguntas que podem vir, e o que responder

**"Por que não usou um ERP pronto?"**
Um ERP genérico não entende que a cor é escolhida no meio do processo, nem que
o forno é carga e não etapa. As duas coisas são a fonte das decisões que mais
economizam dinheiro no ateliê. Adaptar um ERP custaria mais que construir o que
é específico.

**"Como sabe que 73% está entregue?"**
O backlog foi conferido contra o sistema em produção, item por item, e o
histórico de versões é a evidência. Não é autoavaliação, é comparação com o que
está no ar.

**"Qual foi a maior dificuldade?"**
Modelar o saldo de produção. A primeira ideia era um campo com a quantidade em
cada etapa. Isso quebra na primeira movimentação parcial e na primeira perda.
Trocar por um livro de lançamentos que só recebe inclusões resolveu movimentação
parcial, perda, segunda qualidade e divisão de lote de uma vez só.

**"O ateliê usa mesmo?"**
Sim, diariamente, desde julho. E o backlog muda por causa disso: o pedido mais
recente entrou no documento no dia em que foi feito.

**"Como o sistema evita o excesso de produção?"**
Ele parte do mínimo desejado por peça e desconta o que já existe em cada ponto
do processo, inclusive o que está a caminho. Depois infla só pela perda
esperada. Em vez de "faça mais umas", a resposta vira um número: comece
cinquenta e sete. E o estoque intermediário é alocado, nunca oferecido em
duplicidade — vinte peças em biscoito não viram sugestão de esmaltar vinte em
três cores diferentes.

**"E se a Vera pedir algo fora do escopo?"**
O escopo negativo está declarado no documento e é revisado a cada sprint. Se
entrar algo novo, algo sai — e isso também está registrado, na seção que explica
o que foi adiado e por quê.

---

## Lembretes práticos

- **Fale devagar no slide 2 e siga as caixas de cima para baixo.** É onde a
  plateia forma a imagem do problema, e a cadeia só funciona se for contada em
  ordem.
- **Não leia os slides.** Eles são apoio visual; o conteúdo é a sua fala.
- Se o tempo apertar, **corte o slide 3** e junte a ideia dele no 4. O que não
  pode faltar é a rastreabilidade da dor até o item do backlog.
- Leve o documento completo aberto, caso peçam para ver alguma seção.
- Tenha o sistema aberto no celular. Se sobrar tempo, mostrar a tela real do
  quadro de produção vale mais que qualquer slide.
