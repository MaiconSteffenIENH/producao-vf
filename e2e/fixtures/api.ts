import type { APIRequestContext, APIResponse } from '@playwright/test'

/*
 * Cliente da API para PREPARAR o cenário (o "Dado que" do BDD).
 *
 * Criar uma peça com roteiro, abrir um lote e levá-lo até a Secagem pela tela
 * levaria um minuto por cenário e testaria o mesmo caminho 45 vezes. Aqui o
 * preparo é feito pela API, que é a mesma que a tela usa; a ação e a
 * verificação do cenário continuam sendo feitas no navegador.
 */
export type Etapa = {
  id: string
  nome: string
  tipo: string
  defineCor: boolean
  estoqueIntermediario: boolean
  aguardaCarga: boolean
  capacidadeCarga: number | null
}
export type Cor = { id: string; nome: string; hex: string }
export type Peca = {
  id: string
  nome: string
  categoriaId: string
  roteiro: { etapaId: string; ordem: number; diasEstimados?: number | null; etapa?: Etapa }[]
  cores: { corId: string }[]
  insumos: unknown[]
  [k: string]: unknown
}
export type Lote = { id: string; codigo: string; quantidadeInicial: number; pecaId: string; corId: string | null }
/** saldo por etapa, como a API devolve em GET /lotes/:id */
export type Distribuicao = { etapa: { id: string; nome: string }; saldo: number }[]
export type LoteDetalhado = Lote & {
  movimentos: { quantidade: number; tipo: string; etapaOrigem: { nome: string } | null; etapaDestino: { nome: string } | null; motivo: string | null; motivoTipo: string | null }[]
  distribuicao: unknown[]
  saldoTotal: number
  perdaTotal: number
}

export class Api {
  constructor(private readonly ctx: APIRequestContext) {}

  private async ler<T>(r: APIResponse, oque: string): Promise<T> {
    if (!r.ok()) throw new Error(`${oque}: ${r.status()} ${await r.text()}`)
    const texto = await r.text()
    return (texto ? JSON.parse(texto) : undefined) as T
  }
  async get<T>(caminho: string): Promise<T> {
    return this.ler<T>(await this.ctx.get(caminho), `GET ${caminho}`)
  }
  async post<T>(caminho: string, data?: unknown): Promise<T> {
    return this.ler<T>(await this.ctx.post(caminho, { data }), `POST ${caminho}`)
  }
  async put<T>(caminho: string, data?: unknown): Promise<T> {
    return this.ler<T>(await this.ctx.put(caminho, { data }), `PUT ${caminho}`)
  }
  async patch<T>(caminho: string, data?: unknown): Promise<T> {
    return this.ler<T>(await this.ctx.patch(caminho, { data }), `PATCH ${caminho}`)
  }
  async delete<T>(caminho: string): Promise<T> {
    return this.ler<T>(await this.ctx.delete(caminho), `DELETE ${caminho}`)
  }
  /** a resposta crua, para os cenários que esperam recusa */
  raw(): APIRequestContext {
    return this.ctx
  }

  // ── cadastros ──────────────────────────────────────────────────────────────
  async etapas(): Promise<Etapa[]> {
    return this.get<Etapa[]>('/etapas')
  }
  async etapa(nome: string): Promise<Etapa> {
    const e = (await this.etapas()).find((x) => x.nome.toLowerCase() === nome.toLowerCase())
    if (!e) throw new Error(`etapa "${nome}" não existe no seed`)
    return e
  }
  async cores(): Promise<Cor[]> {
    return this.get<Cor[]>('/cores')
  }
  async cor(nome: string): Promise<Cor> {
    const c = (await this.cores()).find((x) => x.nome.toLowerCase() === nome.toLowerCase())
    if (!c) throw new Error(`cor "${nome}" não existe no seed`)
    return c
  }
  async categoriaQualquer(): Promise<{ id: string; nome: string }> {
    const [c] = await this.get<{ id: string; nome: string }[]>('/categorias')
    return c
  }

  /**
   * Peça nova com o roteiro padrão do ateliê (Oleiro → Secagem → 1ª Queima →
   * Biscoito → Esmaltação → 2ª Queima → Pronto) e todas as cores liberadas.
   * O nome vem com sufixo único: o banco é compartilhado entre os cenários.
   */
  async criarPeca(
    nome: string,
    extras: Partial<{
      roteiro: string[]
      cores: string[]
      qtdMinimaDesejada: number
      qtdMinimaBiscoito: number
      tempoMedioDias: number
      [k: string]: unknown
    }> = {},
  ): Promise<Peca> {
    const etapas = await this.etapas()
    const nomesRoteiro = extras.roteiro ?? ['Oleiro', 'Secagem', '1ª Queima', 'Biscoito', 'Esmaltação', '2ª Queima', 'Pronto']
    const roteiro = nomesRoteiro.map((n, i) => {
      const e = etapas.find((x) => x.nome === n)
      if (!e) throw new Error(`etapa "${n}" não existe`)
      return { etapaId: e.id, ordem: i + 1, diasEstimados: n === 'Secagem' ? 5 : n.includes('Queima') ? 2 : 1 }
    })
    const cores = await this.cores()
    const nomesCores = extras.cores ?? cores.map((c) => c.nome)
    const categoria = await this.categoriaQualquer()
    const { roteiro: _r, cores: _c, ...resto } = extras
    return this.post<Peca>('/pecas', {
      nome,
      categoriaId: categoria.id,
      tempoMedioDias: 30,
      qtdMinimaDesejada: 0,
      roteiro,
      cores: nomesCores.map((n) => ({ corId: cores.find((c) => c.nome === n)!.id, qtdMinimaDesejada: 0 })),
      insumos: [],
      ...resto,
    })
  }
  async peca(id: string): Promise<Peca> {
    return this.get<Peca>(`/pecas/${id}`)
  }

  // ── lotes ──────────────────────────────────────────────────────────────────
  async criarLote(pecaId: string, quantidade: number, extras: Record<string, unknown> = {}): Promise<Lote> {
    return this.post<Lote>('/lotes', { pecaId, quantidade, ...extras })
  }
  async avancar(
    loteId: string,
    de: Etapa,
    para: Etapa,
    quantidade: number,
    extras: { corId?: string; motivo?: string; chaveIdempotencia?: string } = {},
  ) {
    return this.post<{ loteCriado?: Lote }>(`/lotes/${loteId}/avancar`, {
      etapaOrigemId: de.id,
      etapaDestinoId: para.id,
      quantidade,
      ...extras,
    })
  }
  /** leva o saldo inteiro do lote, etapa a etapa pelo roteiro da peça, até a etapa pedida */
  async levarAte(lote: Lote, peca: Peca, nomeDaEtapa: string, corParaEsmaltar?: string) {
    const etapas = await this.etapas()
    const caminho = peca.roteiro
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((r) => etapas.find((e) => e.id === r.etapaId)!)
    const alvo = caminho.findIndex((e) => e.nome === nomeDaEtapa)
    if (alvo < 0) throw new Error(`"${nomeDaEtapa}" não está no roteiro`)
    for (let i = 0; i < alvo; i++) {
      const de = caminho[i], para = caminho[i + 1]
      const extras: { corId?: string } = {}
      if (para.defineCor && corParaEsmaltar) extras.corId = (await this.cor(corParaEsmaltar)).id
      await this.avancar(lote.id, de, para, lote.quantidadeInicial, extras)
    }
  }
  async lote(id: string): Promise<LoteDetalhado> {
    return this.get(`/lotes/${id}`)
  }
  /** saldo do lote numa etapa, somado do livro-razão (o que a tela mostra no cartão) */
  async saldoEm(loteId: string, nomeDaEtapa: string): Promise<number> {
    const d = await this.lote(loteId)
    let saldo = 0
    for (const m of d.movimentos) {
      if (m.etapaDestino?.nome === nomeDaEtapa) saldo += m.quantidade
      if (m.etapaOrigem?.nome === nomeDaEtapa) saldo -= m.quantidade
    }
    return saldo
  }
  async registrarPerda(loteId: string, etapa: Etapa, quantidade: number, motivo: string, motivoTipo: string) {
    return this.post(`/lotes/${loteId}/perda`, { etapaId: etapa.id, quantidade, motivo, motivoTipo })
  }

  // ── avisos ─────────────────────────────────────────────────────────────────
  async criarAviso(titulo: string, prazo: string | null, detalhe = '') {
    return this.post<{ id: string; titulo: string }>('/avisos', { titulo, prazo, detalhe })
  }
  async apagarAvisosAbertos() {
    const r = await this.get<{ abertos: { id: string }[] }>('/avisos')
    for (const a of r.abertos) await this.delete(`/avisos/${a.id}`)
  }

  // ── forno ──────────────────────────────────────────────────────────────────
  async filaDoForno() {
    return this.get<{ tipo: string; situacao: { esperando: number; capacidade: number; faltamParaFechar: number }; lotes: { loteId: string; codigo: string; quantidade: number }[] }[]>('/queimas/fila')
  }
  /** cancela o que outros cenários deixaram esperando o forno, para a fila começar do zero */
  async esvaziarFilaDoForno() {
    for (const fila of await this.filaDoForno()) {
      for (const l of fila.lotes) await this.post(`/lotes/${l.loteId}/cancelar`, { motivo: 'limpeza do e2e' })
    }
  }
  async queimas(status?: string) {
    return this.get<{ id: string; codigo: string; status: string; itens: { loteId: string; quantidade: number }[] }[]>(
      `/queimas${status ? `?status=${status}` : ''}`,
    )
  }

  // ── estoque, vendas e preços ───────────────────────────────────────────────
  async darBaixa(pecaId: string, corId: string | null, quantidade: number, motivoTipo = 'venda') {
    return this.post<{ baixado: number }>('/estoque/prontas/baixa', { pecaId, corId, quantidade, motivoTipo })
  }
  async prontas() {
    return this.get<{ grupos: { peca: { id: string; nome: string }; linhas: { corId: string | null; cor: string | null; prontas: number; situacao: string }[] }[] }>('/estoque/prontas')
  }
  async registrarVenda(pecaId: string, corId: string | null, competencia: string, quantidade: number) {
    return this.post<{ id: string }>('/vendas', { pecaId, corId, competencia, quantidade, darBaixa: true })
  }
  async importarVendas(conteudo: string) {
    return this.post<{ importadas: number; atualizadas: number; naoReconhecidas: { peca: string }[] }>('/vendas/importar', { conteudo })
  }
  async definirCusto(pecaId: string, perdaEstimadaPercentual: number) {
    return this.put(`/precos/peca/${pecaId}`, {
      custoArgila: 4, custoEsmalte: 3, custoQueima: 5, custoEmbalagem: 1, minutosMaoDeObra: 30, custoHoraMaoDeObra: 40, outrosCustos: 0,
      perdaEstimadaPercentual, precos: [],
    })
  }
  async precos() {
    return this.get<{ pecas: { pecaId: string; peca: string; custo: { perdaPercentual: number; perdaOrigem: string; perdaAmostra: number } | null }[] }>('/precos')
  }
  async comparativo() {
    return this.get<{ linhas: { pecaId: string; cobertura: { semanas: number | null } }[] }>('/vendas/comparativo')
  }

  // ── encomendas ─────────────────────────────────────────────────────────────
  async criarEncomenda(cliente: string, entregarAte: string, itens: { pecaId: string; quantidade: number; corId?: string }[]) {
    return this.post<{ id: string; codigo: string; prazo: { cabe: boolean; previsao: string; aviso: string | null } }>('/encomendas', { cliente, entregarAte, itens })
  }

  // ── módulos ────────────────────────────────────────────────────────────────
  async ligarModulo(chave: string, ativo: boolean) {
    return this.put(`/modulos/${chave}`, { ativo })
  }
}
