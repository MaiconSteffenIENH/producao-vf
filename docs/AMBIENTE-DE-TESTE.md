# Ambiente de teste

Um segundo sistema, igual ao de produção, onde a equipe pode errar à vontade.
Nada do que acontece aqui chega no ateliê.

```
                    branch git        banco               quem usa
produção   master            →  Neon: main        →  a equipe, todo dia
teste      teste             →  Neon: teste       →  você e a Gabi, antes de subir
```

## O que já protege produção hoje

Antes de montar qualquer coisa, vale saber o que **já** está seguro:

- O Render tem auto-deploy preso à branch `master`. Branch empurrada não dispara
  build nenhum, e a migração só roda no `startCommand` do deploy da master.
- Previews e PR previews do Render estão desligados.

O risco que sobra é a Vercel, que cria preview de qualquer branch por padrão — e
esse preview usaria a `VITE_API_URL` de **produção**. O CORS da API só aceita a
origem configurada, então na prática o preview quebra em vez de estragar dado,
mas isso é sorte, não desenho. É por isso que o ambiente de teste tem front
próprio, apontando para a API própria.

---

## 1. Banco de teste — Neon

Este passo é seu: eu não tenho acesso ao Neon.

1. Abra o projeto `producao-vf` em [console.neon.tech](https://console.neon.tech).
2. **Branches → New Branch**.
3. Nome: `teste`. Origem: `main` (ou o nome da sua branch de produção).
4. Deixe marcado para copiar os dados.

O Neon copia por *copy-on-write*: a cópia é instantânea e não conta espaço em
dobro. Você testa a conversão de "Auto Center" em cadastro com os nomes reais
que estão no banco, que é justamente a parte que pode dar errado.

Em **Connection string**, copie as duas formas, como em produção:

| Guardar como | Qual copiar |
|---|---|
| `DATABASE_URL` | a **pooled** — o host tem `-pooler` no meio |
| `DIRECT_URL` | a **direta** — o mesmo host **sem** o `-pooler` |

> **Não me mande essas URLs pelo chat.** Elas dão acesso de escrita ao banco.
> Cole direto no painel do Render, no passo 2.

---

## 2. API de teste — Render

Serviço novo, plano gratuito, apontando para a branch `teste`:

| Campo | Valor |
|---|---|
| Name | `producao-vf-api-teste` |
| Repository | `MaiconSteffenIENH/producao-vf` |
| Branch | `teste` |
| Root Directory | `backend` |
| Region | Virginia (a mesma do banco) |
| Build Command | igual ao de produção (está no `render.yaml`) |
| Start Command | `npx prisma migrate deploy && node dist/server.js` |
| Health Check Path | `/health` |

Variáveis de ambiente:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a pooled do branch `teste` do Neon |
| `DIRECT_URL` | a direta do branch `teste` do Neon |
| `JWT_SECRET` | gere um novo, diferente do de produção |
| `CORS_ORIGIN` | a URL da Vercel de teste (passo 3) |
| `NODE_ENV` | `production` |

**`JWT_SECRET` diferente do de produção não é capricho.** Com o mesmo segredo,
um token emitido no teste continuaria valendo na produção — e o ambiente onde
todo mundo erra à vontade viraria uma porta para o ambiente onde não se pode
errar.

Confira antes de seguir: `https://producao-vf-api-teste.onrender.com/health`
tem que responder `{"ok":true}`.

> O plano gratuito hiberna depois de 15 minutos parado. A primeira tela depois
> disso demora uns 40 segundos para abrir. É o preço de não pagar, e não é
> defeito.

---

## 3. Aplicação de teste — Vercel

Projeto novo, apontando para a mesma branch:

| Campo | Valor |
|---|---|
| Project Name | `producao-vf-teste` |
| Repository | `MaiconSteffenIENH/producao-vf` |
| Root Directory | `frontend` |
| Production Branch | `teste` |

Variável de ambiente:

| Variável | Valor |
|---|---|
| `VITE_API_URL` | `https://producao-vf-api-teste.onrender.com` |

O Vite embute isso no bundle em tempo de **build**, não em runtime: mudar a
variável depois exige refazer o deploy sem reaproveitar o cache.

Volte no Render e ponha a URL da Vercel de teste em `CORS_ORIGIN`.

---

## Como usar no dia a dia

```bash
# manda a novidade para o teste
git checkout teste
git merge minha-branch
git push                      # dispara o deploy do ambiente de teste

# aprovado? então vai para produção
git checkout master
git merge minha-branch
git push                      # dispara o deploy de verdade
```

A branch `teste` é descartável: se ela embolar, dá para refazer a partir da
master e mesclar as branches de novo. O que não pode é o contrário — a master
nunca recebe merge da `teste`, senão trabalho ainda em prova entra em produção
de carona.

## Quando o teste terminar

O branch do Neon e o serviço do Render continuam existindo de graça, então não
há pressa em apagar. Mas o banco de teste envelhece: depois de algumas semanas
ele já não parece o de produção. Quando for testar algo importante de novo,
apague o branch `teste` no Neon e crie outro a partir do `main` — leva segundos
e devolve os dados de verdade.
