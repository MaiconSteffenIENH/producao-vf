# Publicar o Produção VF

Três serviços gratuitos: **Neon** (banco), **Render** (API), **Vercel** (aplicação).

A ordem importa e há uma dependência circular no meio — o Render precisa saber a URL da Vercel e a Vercel precisa saber a URL do Render. Por isso o passo 4 volta no Render.

---

## Antes de tudo: a migração precisa estar no repositório

O Render aplica as migrações no start (`prisma migrate deploy`). Se a pasta `backend/prisma/migrations` não estiver commitada, ele sobe com o **banco vazio** e todo endpoint quebra com "tabela não existe".

```bash
./rodar-local.sh                    # cria a migração inicial ao rodar migrate dev
git add backend/prisma/migrations
git commit -m "chore: migração inicial do banco"
git push
```

Confira antes de seguir:

```bash
./preparar-deploy.sh
```

Ele verifica isso e mais algumas coisas, e no fim imprime as variáveis prontas para colar.

---

## 1. Banco — Neon

1. Crie a conta em [neon.tech](https://neon.tech) e um projeto chamado `producao-vf`.
2. Escolha a região **AWS us-east-1 (N. Virginia)** — é a mesma costa do Render, e isso evita pagar latência de ida e volta em cada consulta.
3. Em **Connection string**, copie as duas formas:

| Guardar como | Qual copiar |
|---|---|
| `DATABASE_URL` | a **pooled** — o host tem `-pooler` no meio |
| `DIRECT_URL` | a **direta** — o mesmo host **sem** o `-pooler` |

> Por que duas: o `prisma migrate` usa um advisory lock do Postgres que não sobrevive ao PgBouncer da conexão pooled, e o deploy morre com `P1002`. A pooled serve o tráfego normal; a direta só as migrações.

O plano gratuito hiberna o banco depois de alguns minutos parado. A primeira consulta depois disso demora alguns segundos.

---

## 2. API — Render

1. Em [dashboard.render.com](https://dashboard.render.com), **New → Blueprint**.
2. Conecte o repositório `producao-vf`. O Render lê o `render.yaml` da raiz e já monta o serviço `producao-vf-api`.
3. Preencha em **Environment** o que está marcado como `sync: false`:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a pooled do Neon |
| `DIRECT_URL` | a direta do Neon |
| `CORS_ORIGIN` | `https://producao-vf.vercel.app` (ajuste no passo 4 se a Vercel der outro nome) |

`JWT_SECRET` o Render gera sozinho — não mexa. `NODE_ENV` já vem como `production`.

4. Deploy. Quando terminar, anote a URL: normalmente `https://producao-vf-api.onrender.com`.
5. Teste: abra `SUA_URL/health`. Tem que responder `{"ok":true,...}`.

**Sobre o plano gratuito:** o serviço hiberna após ~15 minutos sem tráfego, e a primeira requisição depois disso leva uns 30 a 50 segundos para acordar. Vale avisar a Vera, senão ela vai achar que travou.

---

## 3. Aplicação — Vercel

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório.
2. **Root Directory: `frontend`** — este é o passo que mais gente esquece; sem isso o build falha porque não acha o `package.json`.
3. Framework: Vite (a Vercel detecta sozinha).
4. Environment Variables:

| Variável | Valor |
|---|---|
| `VITE_API_URL` | a URL do Render, ex. `https://producao-vf-api.onrender.com` — **sem barra no fim** |

5. Deploy. Anote a URL final, normalmente `https://producao-vf.vercel.app`.

O `vercel.json` já reescreve todas as rotas para `index.html`, senão recarregar a página em `/pecas` daria 404.

---

## 4. Fechar o círculo

Volte no Render → Environment → `CORS_ORIGIN` e coloque a URL real da Vercel, **sem barra no fim**. Salve; o Render reinicia sozinho.

Se você tiver mais de um domínio (o `.vercel.app` e um próprio), separe por vírgula:

```
https://producao-vf.vercel.app,https://producao.veraflesch.com.br
```

---

## 5. Primeiro acesso

O banco de produção sobe **vazio** — o seed não roda no deploy de propósito, para não recriar dados apagados a cada reinício.

Semeie uma vez, apontando para o banco de produção:

```bash
cd backend
DATABASE_URL="<a pooled do Neon>" DIRECT_URL="<a direta>" \
ADMIN_EMAIL="gabi@veraflesch.com.br" ADMIN_SENHA="uma-senha-boa" \
npm run seed
```

Isso cria peças, esmaltes, etapas, responsáveis e o usuário inicial. A senha é provisória: o sistema obriga a trocar no primeiro login.

Depois é só abrir a URL da Vercel no celular e adicionar à tela de início — é PWA.

---

## Quando algo não funciona

| Sintoma | Causa quase sempre |
|---|---|
| Tela carrega mas nada aparece, console mostra erro de CORS | `CORS_ORIGIN` no Render não bate exatamente com a URL da Vercel (barra no fim conta) |
| Erro "tabela não existe" | `backend/prisma/migrations` não foi commitado |
| Deploy do Render falha com `P1002` | `DIRECT_URL` está apontando para a conexão pooled |
| Build da Vercel não acha o `package.json` | Root Directory não está como `frontend` |
| Primeira requisição do dia demora meio minuto | Normal no plano gratuito do Render |
| Login diz "sem conexão com o servidor" | `VITE_API_URL` errada, ou a API ainda acordando |

---

## Custo

Tudo no gratuito: Neon (0,5 GB), Render (750 h/mês, hiberna), Vercel (100 GB de banda). Para um ateliê com três ou quatro pessoas usando, sobra.

O primeiro limite que você deve encontrar é a hibernação do Render incomodando no uso diário. Aí o plano pago mais barato resolve.
