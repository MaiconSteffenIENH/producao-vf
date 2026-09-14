# Testes de ponta a ponta (E2E)

Os 45 cenários BDD do plano de testes (seção 11 do Documento de Projeto),
rodando no navegador contra a pilha inteira: frontend, API e Postgres. Um
spec por funcionalidade (`tests/bdd-01…13`), um `test` por cenário, com o
mesmo título do documento.

## Rodar na sua máquina

    ./e2e/rodar.sh                # sobe a pilha no Docker, roda tudo, derruba
    ./e2e/rodar.sh bdd-10         # só o quadro de avisos
    MANTER=1 ./e2e/rodar.sh       # deixa a pilha no ar para olhar

Precisa de Docker e Node 20+. A pilha usa `docker-compose.e2e.yml`: banco
próprio (porta 55432), API na 3001 e web na 5173, sem tocar em produção.

Com a pilha já no ar, `cd e2e && npm test` roda de novo sem subir nada.
Relatório da última rodada: `npm run relatorio`.

## Como os testes são feitos

- **O preparo é pela API, a ação e a conferência são na tela.** Criar uma peça
  com roteiro e levar um lote até a Secagem pela tela levaria um minuto por
  cenário e testaria o mesmo caminho 45 vezes. `fixtures/api.ts` faz o "Dado
  que" pela API (a mesma que a tela usa); o "Quando" e o "Então" acontecem no
  navegador.
- **Page Objects** em `pages/`: cada tela é uma classe com os locators e as
  ações; as asserções ficam nos testes.
- **Seletores por papel e rótulo** (`getByRole`, `getByLabel`), nunca por
  posição. Três ganchos foram acrescentados na aplicação para isso: o modal
  tem `role="dialog"`, as mensagens de rodapé têm `role="status"` e o item
  Avisos do menu carrega `data-alerta`.
- **Um worker, banco compartilhado.** Cada cenário cria as próprias peças e
  lotes com nome único; o que é global (fila do forno, avisos abertos) é
  limpo no começo do cenário que depende dele.
- **Login uma vez**, no setup global, por API: o token vai para o
  `localStorage` de todo contexto.

## O que não roda no `master`

- BDD-12 (cadastro a partir do cartão CNPJ) e o cenário "Desligar Fotos
  destrava a venda" (RF 4.11.2) dependem de código que está nas branches
  `cadastros/clientes-fornecedores` e `melhorias/05-09`. Ficam pulados,
  com o motivo no relatório, salvo com `E2E_INCLUIR_EM_TESTE=1`.
- Dois cenários de avisos ("No dia, fica vermelho" e "Virada do dia no fuso")
  são de dia útil e pulam no fim de semana, quando o prazo de hoje recua para
  sexta e vira atraso.

## Onde o E2E roda

| onde | como |
|---|---|
| sua máquina | `./e2e/rodar.sh` (Docker) |
| GitHub Actions | job `e2e` em `.github/workflows/ci.yml`, a cada push |
| ambiente do assistente | `e2e/ambiente/rodar-no-sandbox.sh` (sem Docker, sem binário do Prisma; o cabeçalho do script explica) |

## Defeitos que a bateria já pegou

Ao serem escritos, os cenários encontraram três defeitos em produção,
corrigidos no mesmo commit: etapa nova sem responsável padrão tomava
`400 Invalid uuid` (BDD-6); nome em caixa alta ganhava plural minúsculo,
"20 XÍCARAs RETA" (BDD-9); e a ficha salva com "10,5" voltava como "10.5" ao
reabrir a peça (BDD-13).
