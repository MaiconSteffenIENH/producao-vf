import { Router, type Request, type Response, type NextFunction } from 'express'
import { autenticar, somenteAdmin } from '../middlewares/autenticar'
import { auditar } from '../middlewares/auditoria'
import * as auth from '../services/auth.service'
import * as cadastro from '../services/cadastro.service'
import * as pecas from '../services/peca.service'
import * as usuarios from '../services/usuario.service'
import * as dashboard from '../services/dashboard.service'
import * as lotes from '../services/lote.service'
import * as planejamento from '../services/planejamento.service'
import * as agenda from '../services/agenda.service'
import * as precos from '../services/preco.service'
import {
  categoriaSchema,
  corSchema,
  etapaSchema,
  loginSchema,
  materiaPrimaSchema,
  pecaSchema,
  responsavelSchema,
  trocarSenhaSchema,
  usuarioSchema,
  criarLoteSchema,
  avancarLoteSchema,
  perdaSchema,
  divisaoSchema,
  cancelarLoteSchema,
  custoPecaSchema,
  canalVendaSchema,
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

rotas.use(autenticar, auditar)

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
rotas.post(
  '/pecas/:id/duplicar',
  rota(async (req, res) => {
    res.status(201).json(await pecas.duplicarPeca(req.params.id))
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
    const { pecaId, corId, etapaId, responsavelId, situacao, mes } = req.query as Record<string, string | undefined>
    res.json(await lotes.listarLotes({ pecaId, corId, etapaId, responsavelId, situacao, mes }))
  }),
)
rotas.get('/lotes/kanban', rota(async (req, res) => {
  const { pecaId, corId, responsavelId } = req.query as Record<string, string | undefined>
  res.json(await lotes.kanban({ pecaId, corId, responsavelId }))
}))
rotas.get('/lotes/:id', rota(async (req, res) => void res.json(await lotes.obterLote(req.params.id))))
rotas.post(
  '/lotes',
  rota(async (req, res) => {
    res.status(201).json(await lotes.criarLote(criarLoteSchema.parse(req.body), req.sessao!))
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
  '/lotes/:id/dividir',
  rota(async (req, res) => {
    const dados = divisaoSchema.parse(req.body)
    res.status(201).json(await lotes.dividirLote({ ...dados, loteId: req.params.id }, req.sessao!))
  }),
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

// ── Tarefas diárias ─────────────────────────────────────
rotas.get('/agenda', rota(async (_req, res) => void res.json(await agenda.agendaDoDia())))
rotas.get(
  '/agenda/:responsavelId',
  rota(async (req, res) => void res.json(await agenda.agendaDoResponsavel(req.params.responsavelId))),
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
