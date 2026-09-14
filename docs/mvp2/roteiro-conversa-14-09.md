# Conversa com o professor — 14/09/2026

Roteiro para falar, não para mostrar. Cinco minutos se ele não interromper,
quinze se interromper. Os números entre parênteses são para você ter na mão se
ele perguntar, não para recitar.

---

## 1. Onde estamos no cronograma (30 segundos)

> "A primeira entrega e a apresentação dela estão concluídas. A segunda entrega
> é dia 24, daqui a dez dias, e a apresentação das funcionalidades direto no
> software é dia 28. O terceiro entregável é 29 de outubro."

Se ele perguntar o que vai na segunda entrega: é a pergunta que **você** faz a
ele no fim (ver seção 6). Não invente o conteúdo.

---

## 2. O que mudou desde a última conversa (2 minutos)

Ele levantou três pontos. Responda os três, nessa ordem, um parágrafo cada.

**Escalabilidade — "está nichado demais".**

> "Escrevi o Documento de Arquitetura de Software desenhando a evolução para
> produto multiempresa: uma instalação atendendo vários ateliês, com isolamento
> de dados por empresa. A decisão está registrada como ADR, com as alternativas
> descartadas e as consequências negativas. Escolhi base única com coluna
> discriminadora aplicada pela camada de acesso a dados, e não pela consulta
> escrita à mão, porque isolamento que depende de disciplina humana repetida
> centenas de vezes vaza no dia em que alguém esquece."

(28 páginas, ISO/IEC/IEEE 42010, C4 níveis 1 e 2, 7 requisitos
arquiteturalmente significativos, 8 cenários de qualidade em seis partes, 8
ADRs, 8 riscos técnicos, matriz de rastreabilidade.)

**Marketplaces ligados ao estoque.**

> "Modelei a integração com Mercado Livre e Shopee como porta e adaptadores: o
> núcleo define o que é um canal de venda, e cada marketplace implementa isso
> num adaptador próprio. O pedido recebido dispara um MRP de nível único: quanto
> produzir, dividindo pela taxa de aproveitamento e não somando a perda; quanto
> de cada insumo isso consome; o que falta comprar descontando estoque; e se o
> prazo cabe na capacidade. Tem exemplo numérico completo no documento, com uma
> peça real do ateliê."

(9 fórmulas. Exemplo: 40 xícaras a 12% de perda viram 46 a produzir, 11,64 kg
de argila a comprar, e o gargalo é o prazo do esmalte, não a produção. As contas
foram verificadas por rotina automatizada antes de entrar no documento.)

**Documentação de engenharia de software.**

> "O sistema nasceu sem documentação e agora tem três: o Documento de Projeto
> no modelo que o senhor passou, com as quinze seções e mais duas; o Documento
> de Arquitetura; e um CLAUDE.md no repositório que registra cada decisão
> estrutural com o motivo, para quem pegar o código depois entender por que ele
> é assim e não de outro jeito."

(Documento de Projeto, versão 2, 99 páginas: 71 requisitos funcionais com
situação, 16 não funcionais, 7 processos com diagrama de atividades e 33 regras
de negócio, 14 casos de uso completos, 4 diagramas de sequência, 12 protótipos
de tela, 13 funcionalidades BDD com 45 cenários, 4 máquinas de estado, DER com
29 entidades e dicionário de 278 colunas extraído do banco, matriz de
rastreabilidade requisito × caso de uso × teste × tela, e referências. O que
está em teste ou planejado vem marcado, para ninguém confundir com produção.)

---

## 3. O que está em produção e em uso (1 minuto)

> "O sistema está no ar desde julho e o ateliê usa todo dia. Desde a primeira
> entrega subiram três coisas que vieram de pedido direto da equipe."

- **Ordem de produção imprimível**, pedida pelo João: a ficha plastificada que
  eles perdiam virou impressão com argila, peso e as quatro medidas da peça.
- **Quadro de avisos**, pedido depois de duas entregas ficarem para trás porque
  o combinado morava num quadro branco que era apagado. É um kanban por dia da
  semana, com alerta colorido no menu em qualquer tela. Concluir não apaga, para
  o combinado continuar consultável.
- **Ficha técnica da peça** com tipo de argila e medidas, para a produção ter um
  padrão a seguir.

(46 commits desde 27 de julho, 14 deles depois da primeira entrega. 27
tabelas, 11 migrações, 24 telas, ~24 mil linhas. 502 testes de unidade da
regra de negócio rodando sem banco em dois segundos.)

Se ele perguntar sobre qualidade: a regra de negócio vive separada da
infraestrutura, o que permite testar a matemática sem subir banco. Dois defeitos
foram pegos por teste antes de irem ao ar esta semana: uma data de calendário
sendo exibida um dia antes por causa de fuso, e um aviso de sábado que dizia "é
hoje" em vez de "atrasado".

---

## 4. O que está em teste, fora de produção (30 segundos)

> "Montei um ambiente de teste separado, com banco próprio copiado de produção,
> para a equipe validar antes de subir. Estão lá o cadastro de clientes e
> fornecedores, que lê o cartão CNPJ da Receita e preenche o formulário sozinho,
> e a correção de um travamento no estoque."

(O leitor de CNPJ foi testado com dois cartões reais que diferem em largura de
coluna, complemento e telefone. A migração converte os nomes que já existem em
cadastros sem duplicar por caixa ou acento, provado contra um Postgres real.)

---

## 5. O que vem até a segunda entrega (30 segundos)

> "Até o dia 24: as telas de clientes e fornecedores, que hoje só têm banco e
> leitor. Depois, o importador de lista de preços dos fornecedores, que depende
> de eu conseguir amostras dos PDFs que eles mandam, porque cada um usa um
> layout."

Não prometa a integração com marketplace para a segunda entrega. Ela depende
de conta de desenvolvedor aprovada nos dois canais, e isso não está sob seu
controle.

---

## 6. O que perguntar a ele (1 minuto)

Três perguntas, e são as que valem a conversa:

1. **"O que exatamente o senhor espera na segunda entrega, além da apresentação
   no software?"** — o Classroom diz "2º Entrega" sem descrição visível. Melhor
   ouvir dele do que adivinhar.

2. **"O Documento de Arquitetura entra na segunda entrega ou o senhor quer ele
   revisado antes?"** — ele responde aos três pontos que ele levantou; vale
   saber se ele quer ler antes da data.

3. **"Para o terceiro entregável, o senhor prefere ver a integração com
   marketplace funcionando de verdade ou prefere que eu aprofunde o que já
   existe?"** — a integração real depende de terceiros; se ele preferir
   profundidade, o caminho é outro.

---

## Ponto de atenção antes da conversa

A pasta da turma no Drive tem só a **apresentação** e o **backlog** da primeira
entrega. O Documento de Projeto no modelo dele (99 páginas na versão 2) e o
Documento de Arquitetura (28 páginas) **não estão lá**. Se você entregou por outro caminho,
tudo bem; se não, anexe na atividade "1ª Entrega" antes de conversar, senão ele
vai ouvir sobre documentos que não tem em mãos.
