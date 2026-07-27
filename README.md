# Produção VF

Planejamento e acompanhamento da produção do ateliê **Vera Flesch Cerâmica**.

Web e celular, multiusuário, acessível por link. Cobre cadastros, planejamento, produção em Kanban, tarefas diárias, histórico e preços por canal de venda.

---

## Como rodar local

Um comando:

```bash
./rodar-local.sh
```

Ele confere o Node, pergunta se você quer um Postgres no Docker ou um banco no [Neon](https://neon.tech), escreve os `.env`, instala tudo, cria as tabelas, semeia com as peças e esmaltes reais e sobe backend e frontend juntos.

<details>
<summary>Se preferir na mão</summary>

```bash
# 1. Backend
cd backend
cp .env.example .env          # preencha DATABASE_URL, DIRECT_URL e JWT_SECRET
npm install
npx prisma migrate dev --name inicial   # cria as tabelas e a migração oficial
npm run seed                             # peças, esmaltes, etapas e o usuário inicial
npm run dev                              # http://localhost:3001

# 2. Frontend (outro terminal)
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:3001
npm install
npm run dev                   # http://localhost:5173
```

</details>

### Testes

```bash
npm run test:unidade --prefix backend   # regra pura: preço e saldo. Sem banco, roda em segundos
npm test --prefix backend               # bateria completa, precisa de um banco de teste
./scripts/validar.sh                    # typecheck + testes + build (o mesmo do hook pre-push)
```

Usuário inicial criado pelo seed: **gabi@veraflesch.com.br** / **ceramica123** — o sistema exige trocar a senha no primeiro acesso. Para mudar, use `ADMIN_EMAIL` e `ADMIN_SENHA` antes de rodar o seed.

> A migração oficial sai do `prisma migrate dev`. Existe um `docs/schema-referencia.sql` escrito à mão só para ler o modelo e conferir o desenho — ele **não** é aplicado pelo deploy.

---

## Publicar

### Banco — Neon (grátis)

Crie o projeto e pegue as duas strings de conexão:

- `DATABASE_URL` → a **pooled** (com `-pooler` no host), usada em runtime.
- `DIRECT_URL` → a **direta** (sem `-pooler`), usada pelas migrações. O advisory lock do `prisma migrate` não sobrevive ao PgBouncer e estoura `P1002`.

Escolha a região `us-east-1` para casar com o Render e não pagar latência de costa a costa.

### Backend — Render (grátis)

O `render.yaml` na raiz é um blueprint: conecte o repositório no Render e ele lê o arquivo. Preencha em Environment os valores marcados `sync: false`:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | conexão pooled do Neon |
| `DIRECT_URL` | conexão direta do Neon |
| `CORS_ORIGIN` | a URL da Vercel, ex.: `https://producao-vf.vercel.app` |

`JWT_SECRET` é gerado sozinho. As migrações rodam no start (`prisma migrate deploy`).

O plano gratuito do Render hiberna após inatividade — a primeira requisição do dia demora uns 30 segundos. Vale avisar a Vera antes que ela ache que travou.

### Frontend — Vercel (grátis)

Root directory `frontend`, framework Vite. Variável de ambiente:

| Variável | Valor |
|---|---|
| `VITE_API_URL` | a URL do Render, ex.: `https://producao-vf-api.onrender.com` |

O `vercel.json` já reescreve as rotas para `index.html` (SPA).

Depois de subir, a Vera abre o link no celular e adiciona à tela de início — é PWA.

---

## Estrutura

```
backend/
  prisma/schema.prisma     modelo de dados
  prisma/seed.ts           peças e esmaltes reais do ateliê
  src/routes/index.ts      todas as rotas
  src/services/            regra de negócio
  src/schemas/             validação zod
  tests/                   vitest + supertest (smoke em todo GET)
frontend/
  src/pages/               uma tela por arquivo, todas lazy
  src/components/          ui.tsx, Layout, Modal, ConfirmDialog, CrudSimples
  src/lib/format.ts        formatação — fonte única
docs/
  schema-referencia.sql    o modelo em SQL, para leitura
  esmalte-*.jpg            fotos que originaram os hex dos esmaltes
```

---

## O que já existe

- Login com JWT, senha provisória obrigatória no primeiro acesso, papéis (`gestao`, `producao`, `leitura`) e auditoria de tudo que muda.
- Dashboard que aponta o que falta configurar: peças sem roteiro, peças sem esmalte, e roteiros que não passam pela etapa que define a cor.
- Cadastro de peças com **roteiro próprio** (ordenável) e esmaltes possíveis, mínimos de pronto e de biscoito, duplicação de peça.
- Cadastro de esmaltes com chip de cor **e foto de amostra** — Branco e Pedra Sabão têm quase a mesma cor média, só a textura diferencia.
- Cadastro de responsáveis (com capacidade diária, base da meta diária do oleiro), etapas, categorias e matérias-primas.
- Tema claro/escuro, PWA instalável, puxar-pra-atualizar.

### Planejamento

Sugestões calculadas ao vivo cruzando o mínimo desejado, o que já existe pronto, o que está em biscoito e o que já está a caminho — sem descontar o que está a caminho, o sistema mandaria refazer tudo que ainda está secando. A saída sai no formato que a Gabi pediu: *"Produzir 50 Xícaras Andorinha"*, *"Esmaltar 20 peças Pistache"*, *"Comprar mais esmalte"*. Cada sugestão vira lote com um toque, e mostra se está **não iniciada / em andamento / parcial / concluída** — derivado dos lotes, sem ninguém marcar nada.

### Produção

Quadro Kanban por etapa, com movimentação parcial, registro de perda com motivo, divisão de lote e cancelamento. Cada movimento entra num livro-razão que nunca é editado; o saldo em cada etapa é a soma dele.

O momento crítico é a esmaltação: o lote chega ao biscoito **sem cor**, e ali a Gabi decide o esmalte conforme o que está vendendo. Se ela esmalta só parte, o sistema separa um lote-filho com a cor e mantém o resto neutro — que é exatamente como 40 bowls em biscoito viram 20 Pistache e 20 de outra cor depois.

### Tarefas do dia

O oleiro abre o app e vê quanto precisa fazer hoje. A meta é a capacidade diária ajustada pelo saldo da semana: o que não saiu ontem soma, o que passou abate. O realizado sai dos movimentos que ele registrou — nada é digitado. O saldo zera toda segunda, de propósito.

### Preços por canal

Custo real da peça (material + mão de obra, inflado pela perda) e preço sugerido em cada canal, descontando comissão, taxa fixa, frete subsidiado, anúncios e imposto.

Duas coisas que a maioria das calculadoras erra e que aqui são tratadas:

- **A perda.** Se 12% do que entra no forno não sai vendável, o custo das que sobraram é o custo de todas dividido pelas que sobraram. O sistema usa a perda **medida** no livro-razão quando há amostra suficiente, e a estimada do cadastro enquanto não há.
- **A faixa de preço.** Shopee e Mercado Livre mudam comissão e taxa fixa conforme o valor do produto, e o catálogo da VF (R$49 a R$283) atravessa essas fronteiras. Como o preço depende da faixa e a faixa depende do preço, o cálculo resolve por ponto fixo.

As taxas vêm pré-carregadas com o que estava valendo em julho/2026 e são **todas editáveis** — marketplace muda comissão sem avisar, então confira antes de republicar preço.

## O que ainda falta

- Protocolo de fotos sem a Gabi presente (depende de calibrar a estação com ela antes da viagem).
- Relatórios de período e exportação.
- Amazon Espanha na tabela de preços, quando a operação por lá começar.
