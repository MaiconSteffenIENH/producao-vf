# Produção VF

Planejamento e acompanhamento da produção do ateliê **Vera Flesch Cerâmica**.

Web e celular, multiusuário, acessível por link. **Fase 1** (esta entrega): estrutura, login, dashboard e cadastros.

---

## Como rodar local

Pré-requisitos: Node 20+, PostgreSQL (local ou uma conta gratuita no [Neon](https://neon.tech)).

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
  esmalte-*.png            fotos que originaram os hex dos esmaltes
```

---

## O que já existe (Fase 1)

- Login com JWT, senha provisória obrigatória no primeiro acesso, papéis (`gestao`, `producao`, `leitura`) e auditoria de tudo que muda.
- Dashboard que aponta o que falta configurar: peças sem roteiro, peças sem esmalte, e roteiros que não passam pela etapa que define a cor.
- Cadastro de peças com **roteiro próprio** (ordenável) e esmaltes possíveis, mínimos de pronto e de biscoito, duplicação de peça.
- Cadastro de esmaltes com chip de cor **e foto de amostra** — Branco e Pedra Sabão têm quase a mesma cor média, só a textura diferencia.
- Cadastro de responsáveis (com capacidade diária, base da meta diária do oleiro), etapas, categorias e matérias-primas.
- Tema claro/escuro, PWA instalável, puxar-pra-atualizar.

## O que vem depois

- **Fase 2 — Planejamento.** Sugestão automática cruzando mínimos, biscoito e lotes em andamento: "produzir 50 Xícaras Andorinha", "esmaltar 20 peças Pistache", "comprar mais esmalte".
- **Fase 3 — Produção.** Lotes, Kanban por etapa, movimentação parcial, perdas, divisão de lotes. Aqui entram as **tarefas diárias com saldo rolante**: o oleiro abre o app, vê a meta do dia, e o que não sair hoje soma amanhã (o que passar, abate).
- **Fase 4 — Histórico, relatórios e precificação** com as taxas de Shopee, Mercado Livre e loja própria, usando a perda real medida na Fase 3 para chegar ao custo verdadeiro da peça.
