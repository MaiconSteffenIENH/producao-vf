import { Router, type Request, type Response, type NextFunction } from 'express'
import { autenticar, somenteAdmin } from '../middlewares/autenticar'
import { auditar } from '../middlewares/auditoria'
import { exigirModulo } from '../middlewares/modulos'
import * as auth from '../services/auth.service'
import * as cadastro from '../services/cadastro.service'
import * as pecas from '../services/peca.service'
import * as usuarios from '../services/usuario.service'
import * as modulos from '../services/modulo.service'
import * as dashboard from '../services/dashboard.service'
import * as lotes from '../services/lote.service'
import * as planejamento from '../services/planejamento.service'
import * as agenda from '../services/agenda.service'
import * as precos from '../services/preco.service'
import * as queimas from '../services/queima.service'
import * as vendas from '../services/venda.service'
import * as encomendas from '../services/encomenda.service'
import * as avisos from '../services/aviso.service'
import * as fotos from '../services/foto.service'
import * as estoque from '../services/estoque.service'
import {
  categoriaSchema,
  corSchema,
  etapaSchema,
  loginSchema,
  materiaPrimaSchema,
  ordenacaoSchema,
  pecaSchema,
  duplicarPecaSchema,
  minimoBiscoitoSchema,
  responsavelSchema,
  trocarSenhaSchema,
  usuarioSchema,
  criarLoteSchema,
  editarLoteSchema,
  avancarLoteSchema,
  perdaSchema,
  divisaoSchema,
  cancelarLoteSchema,
  custoPecaSchema,
  canalVendaSchema,
  segundaSchema,
  folgaSchema,
  queimaSchema,
  statusQueimaSchema,
  concluirQueimaSchema,
  baixaDeProntasSchema,
  devolucaoDeVendaSchema,
  vendaSchema,
  importarVendasSchema,
  encomendaSchema,
  avisoSchema,
  fotoSchema,
} from '../schemas'

/** Embrulha handler async para que qualquer throw caia no middleware de erro. */
const rota =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next)

export const rotas = Router()

// ─────────────────────────── Público ───────────────────────────

rotas.get('/health', (_req, res) => res.json({ ok: true, em: new Date().toISOString() }))

rotas.post(
  '/auth/login',
  rota(async (req, res) => {
    res.json(await auth.login(loginSchema.parse(req.body)))
  }),
)

// ─────────────────────────── Autenticado ───────────────────────────

/*
 * O guarda dos módulos entra DEPOIS de `autenticar`, porque precisa do
 * req.sessao, e depois de `auditar`, para a tentativa barrada também ficar
 * registrada. /health e /auth/login continuam livres por estarem registrados
 * ACIMA desta linha — o guarda nunca chega perto deles.
 */
rotas.use(autenticar, auditar, exigirModulo)

rotas.get(
  '/me',
  rota(async (req, res) => {
    res.json(await auth.perfil(req.sessao!.id))
  }),
)

rotas.post(
  '/auth/trocar-senha',
  rota(async (req, res) => {
    await auth.trocarSenha(req.sessao!.id, trocarSenhaSchema.parse(req.body))
    res.json({ ok: true })
  }),
)

rotas.get(
  '/dashboard/resumo',
  rota(async (_req, res) => {
    res.json(await dashboard.resumo())
  }),
)

// ── Peças ───────────────────────────────────────────────
rotas.get(
  '/pecas',
  rota(async (req, res) => {
    const { busca, categoriaId, ativo } = req.query as Record<string, string | undefined>
    res.json(await pecas.listarPecas({ busca, categoriaId, ativo }))
  }),
)
rotas.get(
  '/pecas/:id',
  rota(async (req, res) => {
    res.json(await pecas.obterPeca(req.params.id))
  }),
)
rotas.post(
  '/pecas',
  rota(async (req, res) => {
    res.status(201).json(await pecas.criarPeca(pecaSchema.parse(req.body)))
  }),
)
rotas.get(
  '/pecas/:id/nome-de-copia',
  rota(async (req, res) => {
    res.json(await pecas.sugerirNomeDeCopia(req.params.id))
  }),
)
rotas.post(
  '/pecas/:id/duplicar',
  rota(async (req, res) => {
    const { nome } = duplicarPecaSchema.parse(req.body ?? {})
    res.status(201).json(await pecas.duplicarPeca(req.params.id, nome))
  }),
)
/*
 * O mínimo em biscoito mora aqui, e não em `/estoque/biscoito/...`, embora seja
 * editado na tela de Estoque de biscoito.
 *
 * O guarda de módulos decide pelo PRIMEIRO segmento do caminho, e para escrita
 * vale só o dono da rota — que em `estoque` é `estoque-prontas`, escolhido de
 * propósito por causa da baixa de peças prontas. Uma escrita de biscoito
 * pendurada no mesmo prefixo levaria 403 justamente de quem tem só o módulo de
 * biscoito. Sob `/pecas` a permissão fica idêntica à de antes, quando este
 * número era salvo no PUT da peça.
 */
rotas.patch(
  '/pecas/:id/minimo-biscoito',
  rota(async (req, res) => {
    const { qtdMinimaBiscoito } = minimoBiscoitoSchema.parse(req.body)
    res.json(await pecas.definirMinimoBiscoito(req.params.id, qtdMinimaBiscoito))
  }),
)
rotas.put(
  '/pecas/:id',
  rota(async (req, res) => {
    res.json(await pecas.atualizarPeca(req.params.id, pecaSchema.parse(req.body)))
  }),
)
rotas.delete(
  '/pecas/:id',
  rota(async (req, res) => {
    await pecas.excluirPeca(req.params.id)
    res.json({ ok: true })
  }),
)

// ── Cadastros ───────────────────────────────────────────
type Crud = {
  caminho: string
  listar: () => Promise<unknown>
  criar: (d: never) => Promise<unknown>
  atualizar: (id: string, d: never) => Promise<unknown>
  excluir: (id: string) => Promise<unknown>
  schema: { parse: (d: unknown) => unknown }
}

const cruds: Crud[] = [
  {
    caminho: 'categorias',
    listar: cadastro.listarCategorias,
    criar: cadastro.criarCategoria as never,
    atualizar: cadastro.atualizarCategoria as never,
    excluir: cadastro.excluirCategoria,
    schema: categoriaSchema,
  },
  {
    caminho: 'cores',
    listar: cadastro.listarCores,
    criar: cadastro.criarCor as never,
    atualizar: cadastro.atualizarCor as never,
    excluir: cadastro.excluirCor,
    schema: corSchema,
  },
  {
    caminho: 'responsaveis',
    listar: cadastro.listarResponsaveis,
    criar: cadastro.criarResponsavel as never,
    atualizar: cadastro.atualizarResponsavel as never,
    excluir: cadastro.excluirResponsavel,
    schema: responsavelSchema,
  },
  {
    caminho: 'etapas',
    listar: cadastro.listarEtapas,
    criar: cadastro.criarEtapa as never,
    atualizar: cadastro.atualizarEtapa as never,
    excluir: cadastro.excluirEtapa,
    schema: etapaSchema,
  },
  {
    caminho: 'materias-primas',
    listar: cadastro.listarMateriasPrimas,
    criar: cadastro.criarMateriaPrima as never,
    atualizar: cadastro.atualizarMateriaPrima as never,
    excluir: cadastro.excluirMateriaPrima,
    schema: materiaPrimaSchema,
  },
]

/*
 * A ordem das listas, definida arrastando a linha na tela.
 *
 * ESTAS DUAS ROTAS PRECISAM VIR ANTES DO `for (const c of cruds)`. O laço
 * registra `PUT /categorias/:id`, e o Express casa na ordem em que as rotas
 * foram registradas: se o laço vier primeiro, "ordem" é lido como um id, o
 * zod do cadastro recusa o corpo e o arrasto morre num 400 sem sentido.
 */
rotas.put(
  '/categorias/ordem',
  rota(async (req, res) => {
    res.json(await cadastro.reordenarCategorias(ordenacaoSchema.parse(req.body).ids))
  }),
)
rotas.put(
  '/etapas/ordem',
  rota(async (req, res) => {
    res.json(await cadastro.reordenarEtapas(ordenacaoSchema.parse(req.body).ids))
  }),
)

for (const c of cruds) {
  rotas.get(`/${c.caminho}`, rota(async (_req, res) => void res.json(await c.listar())))
  rotas.post(
    `/${c.caminho}`,
    rota(async (req, res) => void res.status(201).json(await c.criar(c.schema.parse(req.body) as never))),
  )
  rotas.put(
    `/${c.caminho}/:id`,
    rota(async (req, res) => void res.json(await c.atualizar(req.params.id, c.schema.parse(req.body) as never))),
  )
  rotas.delete(
    `/${c.caminho}/:id`,
    rota(async (req, res) => {
      await c.excluir(req.params.id)
      res.json({ ok: true })
    }),
  )
}


// ── Produção (Fase 3) ───────────────────────────────────
rotas.get(
  '/lotes',
  rota(async (req, res) => {
    const { pecaId, corId, etapaId, responsavelId, situacao, mes, motivoPerda } =
      req.query as Record<string, string | undefined>
    res.json(
      await lotes.listarLotes({ pecaId, corId, etapaId, responsavelId, situacao, mes, motivoPerda }),
    )
  }),
)
rotas.get('/lotes/kanban', rota(async (req, res) => {
  const { pecaId, corId, responsavelId } = req.query as Record<string, string | undefined>
  res.json(await lotes.kanban({ pecaId, corId, responsavelId }))
}))
/*
 * ANTES de `/lotes/:id`, e não depois.
 *
 * Os dois caminhos têm dois segmentos, então o Express casaria
 * `/lotes/ordem-producao` com `:id = "ordem-producao"` e a ordem morreria num
 * "Lote não encontrado" que não explica nada. Rota literal vem primeiro.
 */
rotas.get(
  '/lotes/ordem-producao',
  rota(async (req, res) => {
    const ids = String((req.query.ids as string) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    res.json(await lotes.ordemDeProducao(ids))
  }),
)
rotas.get('/lotes/:id', rota(async (req, res) => void res.json(await lotes.obterLote(req.params.id))))
rotas.post(
  '/lotes',
  rota(async (req, res) => {
    res.status(201).json(await lotes.criarLote(criarLoteSchema.parse(req.body), req.sessao!))
  }),
)
/*
 * Corrigir a capa do lote: observação, data de abertura e quantidade inicial.
 *
 * PATCH e não PUT porque o corpo é parcial de propósito: o lote tem peça, cor,
 * roteiro e movimentos, e nada disso se corrige por aqui. Mandar o lote inteiro
 * daria a impressão de que dá.
 */
rotas.patch(
  '/lotes/:id',
  rota(async (req, res) => {
    res.json(await lotes.editarLote(req.params.id, editarLoteSchema.parse(req.body)))
  }),
)
rotas.post(
  '/lotes/:id/avancar',
  rota(async (req, res) => {
    const dados = avancarLoteSchema.parse(req.body)
    res.json(await lotes.avancarLote({ ...dados, loteId: req.params.id }, req.sessao!))
  }),
)
rotas.post(
  '/lotes/:id/perda',
  rota(async (req, res) => {
    const dados = perdaSchema.parse(req.body)
    res.json(await lotes.registrarPerda({ ...dados, loteId: req.params.id }, req.sessao!))
  }),
)
rotas.post(
  '/lotes/:id/segunda',
  rota(async (req, res) => {
    const dados = segundaSchema.parse(req.body)
    res.json(await lotes.registrarSegunda({ ...dados, loteId: req.params.id }, req.sessao!))
  }),
)
rotas.post(
  '/lotes/:id/dividir',
  rota(async (req, res) => {
    const dados = divisaoSchema.parse(req.body)
    res.status(201).json(await lotes.dividirLote({ ...dados, loteId: req.params.id }, req.sessao!))
  }),
)
rotas.get(
  '/lotes/:id/exclusao',
  rota(async (req, res) => void res.json(await lotes.previaDaExclusao(req.params.id))),
)
rotas.delete(
  '/lotes/:id',
  rota(async (req, res) => void res.json(await lotes.excluirLote(req.params.id))),
)
rotas.post(
  '/lotes/:id/cancelar',
  rota(async (req, res) => {
    const { motivo } = cancelarLoteSchema.parse(req.body)
    res.json(await lotes.cancelarLote(req.params.id, motivo, req.sessao!))
  }),
)

// ── Planejamento (Fase 2) ───────────────────────────────
rotas.get('/planejamento', rota(async (_req, res) => void res.json(await planejamento.sugerir())))

// ── Forno: a fila e as fornadas ─────────────────────────
rotas.get('/queimas/fila', rota(async (_req, res) => void res.json(await queimas.filaDasQueimas())))
rotas.get(
  '/queimas',
  rota(async (req, res) => {
    const { status } = req.query as Record<string, string | undefined>
    res.json(await queimas.listarQueimas({ status }))
  }),
)
rotas.post(
  '/queimas',
  rota(async (req, res) => {
    res.status(201).json(await queimas.abrirQueima(queimaSchema.parse(req.body)))
  }),
)
rotas.patch(
  '/queimas/:id/status',
  rota(async (req, res) => {
    const { status } = statusQueimaSchema.parse(req.body)
    res.json(await queimas.atualizarStatusQueima(req.params.id, status))
  }),
)
rotas.get(
  '/queimas/:id/previa-conclusao',
  rota(async (req, res) => void res.json(await queimas.previaDaConclusao(req.params.id))),
)
rotas.post(
  '/queimas/:id/concluir',
  rota(async (req, res) => {
    const { quebras } = concluirQueimaSchema.parse(req.body)
    res.json(await queimas.concluirQueima(req.params.id, quebras, req.sessao!))
  }),
)

/*
 * Baixa do estoque de peças prontas.
 *
 * Fica sob /estoque porque é a tela de onde ela é dada, e porque o módulo que
 * a libera é o mesmo do estoque de prontas.
 */
rotas.post(
  '/estoque/prontas/baixa',
  rota(async (req, res) => {
    res.json(await estoque.darBaixaDeProntas(baixaDeProntasSchema.parse(req.body), req.sessao!))
  }),
)

// ── Vendas: o lado que faltava do briefing ──────────────
rotas.get(
  '/vendas',
  rota(async (req, res) => {
    const { competencia, pecaId } = req.query as Record<string, string | undefined>
    res.json(await vendas.listarVendas({ competencia, pecaId }))
  }),
)
rotas.get(
  '/vendas/comparativo',
  rota(async (_req, res) => void res.json(await vendas.compararProducaoComVendas())),
)
rotas.post(
  '/vendas',
  rota(
    async (req, res) =>
      void res.status(201).json(await vendas.salvarVenda(vendaSchema.parse(req.body), req.sessao!)),
  ),
)
rotas.post(
  '/vendas/importar',
  rota(async (req, res) => {
    const { conteudo, canalId } = importarVendasSchema.parse(req.body)
    res.json(await vendas.importarVendas(conteudo, canalId ?? null, req.sessao!))
  }),
)
/*
 * Devolução do cliente: a peça volta para a prateleira e a venda passa a valer
 * o líquido. A venda em si não é apagada — quem quiser apagar usa o DELETE, que
 * devolve o que ainda estava fora.
 */
rotas.post(
  '/vendas/:id/devolucao',
  rota(async (req, res) => {
    const { quantidade } = devolucaoDeVendaSchema.parse(req.body)
    res.json(await vendas.devolverVenda(req.params.id, quantidade, req.sessao!))
  }),
)
rotas.delete(
  '/vendas/:id',
  rota(async (req, res) => {
    // devolve ao estoque o que ainda estava fora antes de sumir com a linha
    res.json(await vendas.apagarVenda(req.params.id, req.sessao!))
  }),
)

// ── Encomendas ──────────────────────────────────────────
rotas.get(
  '/encomendas',
  rota(async (req, res) => {
    const { status } = req.query as Record<string, string | undefined>
    res.json(await encomendas.listarEncomendas({ status }))
  }),
)
rotas.get(
  '/encomendas/:id',
  rota(async (req, res) => void res.json(await encomendas.obterEncomenda(req.params.id))),
)
rotas.post(
  '/encomendas',
  rota(async (req, res) => {
    res.status(201).json(await encomendas.criarEncomenda(encomendaSchema.parse(req.body)))
  }),
)
rotas.put(
  '/encomendas/:id',
  rota(async (req, res) => {
    res.json(await encomendas.atualizarEncomenda(req.params.id, encomendaSchema.partial().parse(req.body)))
  }),
)
rotas.delete(
  '/encomendas/:id',
  rota(async (req, res) => {
    await encomendas.apagarEncomenda(req.params.id)
    res.status(204).end()
  }),
)

// ── Quadro de avisos ────────────────────────────────────
/*
 * `/avisos/resumo` vem ANTES de qualquer `/avisos/:id`.
 *
 * As duas rotas têm dois segmentos, e o Express casa na ordem de registro:
 * declarada depois, "resumo" seria lida como um id e a consulta que o menu faz
 * a cada minuto responderia 404 em toda tela do sistema.
 */
rotas.get('/avisos/resumo', rota(async (_req, res) => void res.json(await avisos.resumoDoQuadro())))
rotas.get(
  '/avisos',
  rota(async (req, res) => {
    const { concluidos, semana } = req.query as Record<string, string | undefined>
    res.json(
      await avisos.listarAvisos({
        concluidos: concluidos ? Number(concluidos) : undefined,
        // qualquer dia da semana serve: o service normaliza para a segunda
        semana: /^\d{4}-\d{2}-\d{2}$/.test(semana ?? '') ? semana : undefined,
      }),
    )
  }),
)
rotas.post(
  '/avisos',
  rota(async (req, res) => {
    res.status(201).json(await avisos.criarAviso(avisoSchema.parse(req.body), req.sessao))
  }),
)
rotas.put(
  '/avisos/:id',
  rota(async (req, res) => {
    res.json(await avisos.atualizarAviso(req.params.id, avisoSchema.partial().parse(req.body)))
  }),
)
rotas.post(
  '/avisos/:id/concluir',
  rota(async (req, res) => void res.json(await avisos.concluirAviso(req.params.id, req.sessao))),
)
rotas.post(
  '/avisos/:id/reabrir',
  rota(async (req, res) => void res.json(await avisos.reabrirAviso(req.params.id))),
)
rotas.delete(
  '/avisos/:id',
  rota(async (req, res) => {
    await avisos.apagarAviso(req.params.id)
    res.status(204).end()
  }),
)

// ── Fila de fotografia (a etapa da Gabi) ────────────────
rotas.get('/fotos', rota(async (_req, res) => void res.json(await fotos.filaDeFotos())))
rotas.patch(
  '/fotos/:id',
  rota(async (req, res) => void res.json(await fotos.atualizarFoto(req.params.id, fotoSchema.parse(req.body)))),
)
rotas.post(
  '/fotos/:id/avancar',
  rota(async (req, res) => void res.json(await fotos.avancarFoto(req.params.id))),
)

// ── Estoque: o pulmão de biscoito e o que já está pronto ─
rotas.get('/estoque/biscoito', rota(async (_req, res) => void res.json(await estoque.estoqueDeBiscoito())))
rotas.get('/estoque/prontas', rota(async (_req, res) => void res.json(await estoque.estoqueDeProntas())))

// ── Tarefas diárias ─────────────────────────────────────
rotas.get('/agenda', rota(async (_req, res) => void res.json(await agenda.agendaDoDia())))
rotas.get(
  '/agenda/:responsavelId',
  rota(async (req, res) => void res.json(await agenda.agendaDoResponsavel(req.params.responsavelId))),
)
rotas.get(
  '/folgas',
  rota(async (req, res) => {
    const { responsavelId } = req.query as Record<string, string | undefined>
    res.json(await agenda.listarFolgas(responsavelId))
  }),
)
rotas.post(
  '/folgas',
  rota(async (req, res) => void res.status(201).json(await agenda.registrarFolga(folgaSchema.parse(req.body)))),
)
rotas.delete(
  '/folgas/:id',
  rota(async (req, res) => {
    await agenda.apagarFolga(req.params.id)
    res.status(204).end()
  }),
)

// ── Precificação (Fase 4) ───────────────────────────────
rotas.get(
  '/precos',
  rota(async (req, res) => {
    const { pecaId } = req.query as Record<string, string | undefined>
    res.json(await precos.precificar(pecaId))
  }),
)
rotas.put(
  '/precos/peca/:pecaId',
  rota(async (req, res) => void res.json(await precos.salvarCusto(req.params.pecaId, custoPecaSchema.parse(req.body)))),
)
rotas.get('/canais', rota(async (_req, res) => void res.json(await precos.listarCanais())))
rotas.post(
  '/canais',
  rota(async (req, res) => void res.status(201).json(await precos.salvarCanal(null, canalVendaSchema.parse(req.body)))),
)
rotas.put(
  '/canais/:id',
  rota(async (req, res) => void res.json(await precos.salvarCanal(req.params.id, canalVendaSchema.parse(req.body)))),
)
rotas.delete(
  '/canais/:id',
  rota(async (req, res) => {
    await precos.excluirCanal(req.params.id)
    res.json({ ok: true })
  }),
)

// ── Usuários e papéis (só admin) ────────────────────────
rotas.get('/papeis', rota(async (_req, res) => void res.json(await usuarios.listarPapeis())))

rotas.get('/usuarios', somenteAdmin, rota(async (_req, res) => void res.json(await usuarios.listarUsuarios())))
rotas.post(
  '/usuarios',
  somenteAdmin,
  rota(async (req, res) => void res.status(201).json(await usuarios.criarUsuario(usuarioSchema.parse(req.body)))),
)
rotas.put(
  '/usuarios/:id',
  somenteAdmin,
  rota(async (req, res) => void res.json(await usuarios.atualizarUsuario(req.params.id, usuarioSchema.parse(req.body)))),
)
rotas.post(
  '/usuarios/:id/redefinir-senha',
  somenteAdmin,
  rota(async (req, res) => void res.json(await usuarios.redefinirSenha(req.params.id))),
)
rotas.delete(
  '/usuarios/:id',
  somenteAdmin,
  rota(async (req, res) => {
    await usuarios.excluirUsuario(req.params.id, req.sessao!.id)
    res.json({ ok: true })
  }),
)

// ── Módulos: o que o ateliê usa (só admin) ──────────────
rotas.get('/modulos', somenteAdmin, rota(async (_req, res) => void res.json(await modulos.listarModulos())))
rotas.put(
  '/modulos/:chave',
  somenteAdmin,
  rota(async (req, res) => void res.json(await modulos.definirAtivo(req.params.chave, req.body))),
)

/*
 * O corpo vai cru para o service: `{ modulos: [...] }` restringe e
 * `{ modulos: null }` devolve o papel a ver tudo. A diferença entre lista
 * VAZIA e ausência de lista é regra do ateliê, não formato de requisição.
 */
rotas.put(
  '/papeis/:id/modulos',
  somenteAdmin,
  rota(async (req, res) => void res.json(await usuarios.definirModulosDoPapel(req.params.id, req.body))),
)
