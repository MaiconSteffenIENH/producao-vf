# Produção VF — Ateliê Vera Flesch Cerâmica

Sistema web/PWA de planejamento e acompanhamento da produção de um ateliê de cerâmica artesanal. Frontend React + TS + Vite + Tailwind v4 (Vercel), backend Node + Express + TS + Prisma + PostgreSQL (Render + Neon). Tudo em pt-BR: código, commits, UI e mensagens de erro.

**Não é** ERP, financeiro nem estoque de vendas. O foco é: o que produzir, onde cada lote está, quantas peças ficaram prontas.

## Comandos

- Validação completa (obrigatória antes de commitar): `./scripts/validar.sh`
- Backend: `npm run dev --prefix backend` (porta 3001) · testes: `npm test --prefix backend`
- Frontend: `npm run dev --prefix frontend` (porta 5173) · build: `npm run build --prefix frontend`
- Semear o banco: `npm run seed --prefix backend`

## Decisões estruturais (mudar aqui quebra o planejamento)

1. **A cor não faz parte do nome da peça.** No site é "Bowl Pistache"; aqui é peça `Bowl` + esmalte `Pistache`. É isso que permite filtrar por peça e por cor e que faz o planejamento dizer "esmaltar 20 peças Pistache" em vez de listar SKU a SKU.
2. **O lote nasce sem cor.** A ordem real do ateliê é: modelar → secar → **1ª queima (biscoito)** → *só então* escolher a cor conforme o que está vendendo → esmaltar → **2ª queima**. Uma única etapa tem `defineCor = true` (Esmaltação); o service recusa marcar duas, senão o lote trocaria de cor no meio do caminho.
3. **Biscoito é estoque neutro** (`estoqueIntermediario = true`). Peça parada ali pode virar qualquer cor — é o pulmão que atende uma cor que saiu bem sem começar tudo do zero. Por isso `Peca.qtdMinimaBiscoito` existe separado de `qtdMinimaDesejada`.
4. **Cada peça tem roteiro próprio.** Xícara Bojudinha passa por alças e colagem; Tortinha vai direto da equipe pra secagem. O roteiro é substituído inteiro no update — é a única forma de reordenar sem colidir com `@@unique([pecaId, ordem])`.
5. **Conclusão é estado derivado, nunca um campo marcado à mão.** Não iniciada = sugestão sem lote; em andamento = quantidade antes de "Pronto"; parcial = parte pronta, parte não; concluída = pronto ≥ planejado. Checkbox manual apodrece com o uso.

## Regras de código

1. **Largura de campo**: `Input`/`Select`/`Textarea` têm `w-full` na classe base, que vence qualquer `w-N` do className. Largura custom = embrulhar em `<div className="w-N">`.
2. **Tema**: os tokens são semânticos (`fundo`, `superficie`, `tinta`, `marca`, `borda`), não a escala do Tailwind. Texto sobre sólido é `text-contraste` — nunca `text-white`, que não acompanha o tema. Toda UI nova precisa ser conferida no `.dark`.
3. **Nunca `window.prompt/confirm/alert`**: usar `Modal` e `ConfirmDialog`. Eles pausam o auto-refresh enquanto abertos, então um recarregamento não apaga o que o usuário está digitando.
4. **Auto-refresh**: listagens usam `useAutoRefresh(() => recarregar(true))` — foco + puxar-pra-atualizar. Polling só com `{ aoVivo: true }`, reservado a telas de dado quente (o Kanban da Fase 3). Nunca passar o loader direto como handler: o evento vira o parâmetro `silencioso`.
5. **Tela nova entra como chunk lazy** no `App.tsx`. Import estático de página engorda o bundle inicial — o ateliê usa 4G.
6. **Busca por nome é acento-insensível**: coluna `nome_busca` preenchida com `normalizarBusca()` (`backend/src/lib/busca.ts`), espelhada em `frontend/src/lib/format.ts`. Teclado sem acento precisa achar "Xícara".
7. **Endpoint GET novo entra no smoke test** (`backend/tests/smoke.test.ts`).
8. **Backend leniente, regra no service**: linha em branco de formulário dinâmico chega ao backend; o zod aceita e o service filtra/dedup/rejeita com 409 ou 422. Schema rígido devolve 400 antes do service poder limpar.
9. **Migração com SQL manual** (trigger, extensão, backfill): `npx prisma migrate dev --create-only` e editar o SQL. As migrações rodam sozinhas no deploy do Render.
10. **Mobile primeiro**: testar em ~375px. Cabeçalho de página usa `flex flex-col gap-3 sm:flex-row …` — `flex items-center justify-between` puro espreme o título na vertical no celular. Fonte de input não desce de 16px no mobile (o iOS dá zoom e a tela abre ampliada).

## Detalhe do domínio que a interface precisa respeitar

**Branco e Pedra Sabão têm praticamente a mesma cor média** (`#D9D7DA` e `#D5D2CA`) — medido das fotos reais. O que separa os dois é a densidade das pintas. Chip de cor sozinho não resolve: por isso `Cor.amostraUrl` e `Cor.malhado` existem, e o `ChipCor` mostra a foto quando ela existe. Esmaltar um lote inteiro na cor errada custa 30 dias.

## Fluxo de entrega

Implementar → `./scripts/validar.sh` → conferir no preview (mobile também) → commit em pt-BR (conventional commits). O hook `pre-push` revalida.
