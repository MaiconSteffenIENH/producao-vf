import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { dataBr, hojeNoAtelie } from '../lib/format'
import {
  MOTIVOS_PERDA,
  MOTIVO_NAO_INFORMADO,
  MOTIVO_QUALQUER,
  rotuloDoMotivo,
} from '../lib/motivos-perda'
import { avisar } from '../components/Toaster'
import {
  Botao,
  CabecalhoPagina,
  Campo,
  Carregando,
  ChipCor,
  Etiqueta,
  Input,
  InputNumero,
  Modal,
  Select,
  Textarea,
  Vazio,
} from '../components/ui'
import { ConfirmarExclusaoLote } from '../components/ConfirmarExclusaoLote'

/** Uma fatia do ranking de perdas: a conta vem pronta do backend, de propósito. */
type LinhaDeMotivo = { valor: string; rotulo: string; quantidade: number; percentual: number }

type Lote = {
  id: string
  codigo: string
  quantidadeInicial: number
  saldoTotal: number
  origem: string
  iniciadoEm: string
  /** AAAA-MM-DD no fuso do ateliê, pronto para o campo de data */
  iniciadoEmDia: string
  concluidoEm: string | null
  canceladoEm: string | null
  observacao: string | null
  peca: { id: string; nome: string; categoria: { nome: string } }
  cor: { id: string; nome: string; hex: string; malhado: boolean; amostraUrl: string | null } | null
  loteOrigem: { id: string; codigo: string } | null
  distribuicao: { etapaId: string; etapa: string; quantidade: number }[]
  perdaTotal: number
  perdaPorMotivo: LinhaDeMotivo[]
}

/*
 * O ranking inteiro vem pronto do backend nos DOIS endpoints — a tela nunca
 * soma nada. A listagem recebe, além dele, o motivo campeão já escolhido: é o
 * único que cabe na linha da tabela sem abrir o lote.
 */
type LoteDaLista = Lote & { perdaPrincipal: LinhaDeMotivo | null }

type Movimento = {
  id: string
  tipo: string
  quantidade: number
  motivo: string | null
  /** nulo em toda perda anterior à lista de motivos — vira "Não informado" */
  motivoTipo: string | null
  usuarioNome: string
  criadoEm: string
  etapaOrigem: { nome: string } | null
  etapaDestino: { nome: string } | null
  cor: { nome: string; hex: string } | null
  responsavel: { nome: string; cor: string } | null
}

type Detalhe = Lote & { movimentos: Movimento[]; roteiro: { etapa: { nome: string } }[] }

const ROTULO_TIPO: Record<string, string> = {
  inicio: 'abertura',
  avanco: 'avanço',
  retorno: 'retorno',
  perda: 'perda',
  divisao_saida: 'saiu por divisão',
  // a peça saiu da prateleira: venda, feira, brinde ou uso do ateliê
  saida: 'saída do estoque',
  devolucao: 'voltou ao estoque',
  divisao_entrada: 'entrou por divisão',
}

const COR_TIPO: Record<string, string> = {
  inicio: '#3E5C4B',
  avanco: '#BBA58C',
  retorno: '#B4703A',
  perda: '#A4402F',
  divisao_saida: '#918787',
  divisao_entrada: '#918787',
  // saída é o fim feliz do caminho, e não uma perda: cor de conclusão, não de
  // alarme — pintar venda de vermelho faria o histórico parecer um desastre
  saida: '#3E5C4B',
  devolucao: '#8E7150',
}

/**
 * Cinza do "não informado". Ele conta no total de peças perdidas, mas não é
 * diagnóstico — pintá-lo de vermelho junto com os motivos de verdade daria a
 * ele um peso de resposta que ele não tem.
 */
const COR_SEM_MOTIVO = '#918787'

export function Historico() {
  const [lotes, setLotes] = useState<LoteDaLista[]>([])
  const [pecas, setPecas] = useState<{ id: string; nome: string }[]>([])
  const [cores, setCores] = useState<{ id: string; nome: string }[]>([])
  const [etapas, setEtapas] = useState<{ id: string; nome: string }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtros, setFiltros] = useState({
    pecaId: '',
    corId: '',
    etapaId: '',
    situacao: '',
    mes: '',
    motivoPerda: '',
  })
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const [paraCancelar, setParaCancelar] = useState<Lote | null>(null)
  const [paraApagar, setParaApagar] = useState<string | null>(null)
  const [motivoCancelar, setMotivoCancelar] = useState('')
  /*
   * A capa do lote: observação e data de abertura.
   *
   * `null` = não está editando. Guardar o rascunho separado do `detalhe` é o
   * que faz Cancelar de fato desfazer — mexer no `detalhe` deixaria o texto
   * alterado na tela mesmo depois de desistir.
   */
  const [capa, setCapa] = useState<{ observacao: string; iniciadoEm: string; quantidade: string } | null>(
    null,
  )
  const [salvandoCapa, setSalvandoCapa] = useState(false)

  const salvarCapa = async () => {
    if (!detalhe || !capa) return
    setSalvandoCapa(true)
    try {
      await api.patch(`/lotes/${detalhe.id}`, {
        observacao: capa.observacao,
        iniciadoEm: capa.iniciadoEm,
        // campo vazio = não mexe. `Number('')` é 0, e mandar 0 derrubava o
        // salvamento da OBSERVAÇÃO junto, num erro sobre quantidade
        quantidade: capa.quantidade.trim() === '' ? null : Number(capa.quantidade),
      })
      /*
       * RECARREGA O DETALHE INTEIRO, e não só os campos que mudaram.
       *
       * A resposta do PATCH é o lote cru — sem movimentos, sem distribuição. Se
       * a tela só costurasse os escalares, a linha do movimento de abertura no
       * histórico continuaria mostrando a data e a quantidade velhas até alguém
       * fechar e reabrir o lote, que é a forma mais convincente de parecer que
       * não salvou.
       */
      const { data } = await api.get(`/lotes/${detalhe.id}`)
      setDetalhe(data)
      setCapa(null)
      avisar.ok('Lote atualizado.')
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para salvar.'))
    } finally {
      setSalvandoCapa(false)
    }
  }

  const recarregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true)
      try {
        const params = new URLSearchParams()
        for (const [chave, valor] of Object.entries(filtros)) if (valor) params.set(chave, valor)
        const { data } = await api.get(`/lotes?${params.toString()}`)
        setLotes(data)
      } catch (erro) {
        avisar.erro(mensagemDoErro(erro, 'Não deu para carregar o histórico.'))
      } finally {
        setCarregando(false)
      }
    },
    [filtros],
  )

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  useEffect(() => {
    Promise.all([api.get('/pecas'), api.get('/cores'), api.get('/etapas')])
      .then(([p, c, e]) => {
        setPecas(p.data)
        setCores(c.data)
        setEtapas(e.data)
      })
      .catch(() => avisar.erro('Não deu para carregar os filtros.'))
  }, [])

  useAutoRefresh(useCallback(() => void recarregar(true), [recarregar]))

  const abrirDetalhe = async (lote: Lote) => {
    try {
      const { data } = await api.get(`/lotes/${lote.id}`)
      setDetalhe(data)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para abrir o lote.'))
    }
  }

  const cancelar = async () => {
    if (!paraCancelar) return
    try {
      await api.post(`/lotes/${paraCancelar.id}/cancelar`, { motivo: motivoCancelar || 'Cancelado' })
      avisar.ok('Lote cancelado.')
      setParaCancelar(null)
      setMotivoCancelar('')
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para cancelar.'))
    }
  }

  const situacaoDe = (l: Lote) =>
    l.canceladoEm
      ? { rotulo: 'cancelado', cor: '#918787' }
      : l.concluidoEm
        ? { rotulo: 'concluído', cor: '#3E5C4B' }
        : { rotulo: 'em andamento', cor: '#B4703A' }

  return (
    <>
      <CabecalhoPagina
        titulo="Histórico"
        descricao="Todos os lotes, com o caminho completo de cada um. Nada é apagado."
        acoes={
          <>
            <div className="w-full sm:w-40">
              <Select value={filtros.pecaId} onChange={(e) => setFiltros({ ...filtros, pecaId: e.target.value })}>
                <option value="">Todas as peças</option>
                {pecas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full sm:w-36">
              <Select value={filtros.corId} onChange={(e) => setFiltros({ ...filtros, corId: e.target.value })}>
                <option value="">Todas as cores</option>
                {cores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full sm:w-36">
              <Select value={filtros.etapaId} onChange={(e) => setFiltros({ ...filtros, etapaId: e.target.value })}>
                <option value="">Todas as etapas</option>
                {etapas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full sm:w-36">
              <Select value={filtros.situacao} onChange={(e) => setFiltros({ ...filtros, situacao: e.target.value })}>
                <option value="">Todas</option>
                <option value="andamento">Em andamento</option>
                <option value="concluido">Concluídos</option>
                <option value="cancelado">Cancelados</option>
              </Select>
            </div>
            {/*
              PERDA COMO FILTRO, não só como número.
              A primeira opção da lista é "só o que teve perda": achar o lote
              problemático era rolar a tabela inteira, porque perda não aparecia
              em lugar nenhum da listagem. As de baixo respondem a pergunta que
              não dava para fazer — não quanto se perdeu, mas por quê.
            */}
            <div className="w-full sm:w-44">
              <Select
                value={filtros.motivoPerda}
                onChange={(e) => setFiltros({ ...filtros, motivoPerda: e.target.value })}
                aria-label="Perdas"
              >
                <option value="">Com ou sem perda</option>
                <option value={MOTIVO_QUALQUER}>Só o que teve perda</option>
                <optgroup label="Perdeu por">
                  {MOTIVOS_PERDA.map((m) => (
                    <option key={m.valor} value={m.valor}>
                      {m.rotulo}
                    </option>
                  ))}
                  <option value={MOTIVO_NAO_INFORMADO}>{rotuloDoMotivo(MOTIVO_NAO_INFORMADO)}</option>
                </optgroup>
              </Select>
            </div>
            <div className="w-full sm:w-36">
              <Input
                type="month"
                value={filtros.mes}
                onChange={(e) => setFiltros({ ...filtros, mes: e.target.value })}
                aria-label="Mês"
              />
            </div>
          </>
        }
      />

      {carregando ? (
        <Carregando />
      ) : lotes.length === 0 ? (
        <Vazio titulo="Nenhum lote encontrado" descricao="Ajuste os filtros ou abra um lote na tela de Produção." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="bg-superficie-2 text-left text-xs uppercase tracking-wide text-tinta-fraca">
              <tr>
                <th className="px-4 py-3 font-medium">Lote</th>
                <th className="px-4 py-3 font-medium">Peça</th>
                <th className="px-4 py-3 font-medium">Esmalte</th>
                <th className="px-4 py-3 font-medium">Onde está</th>
                <th className="px-4 py-3 font-medium">Perdas</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Início</th>
                <th className="px-4 py-3 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => {
                const s = situacaoDe(l)
                /*
                 * O campeão diagnosticado ganha do "não informado" mesmo quando
                 * é menor: num lote com uma perda velha sem motivo e cinco
                 * trincas, a linha tem de dizer "trincou" — dizer "não
                 * informado" seria esconder o que o lote justamente já contou.
                 */
                const motivoTopo = l.perdaPrincipal ?? l.perdaPorMotivo[0] ?? null
                return (
                  <tr
                    key={l.id}
                    onClick={() => abrirDetalhe(l)}
                    className="cursor-pointer border-t border-borda hover:bg-superficie-2"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-tinta">{l.codigo}</p>
                      <p className="text-xs text-tinta-fraca">
                        {l.quantidadeInicial} inicial · {l.saldoTotal} agora
                      </p>
                    </td>
                    <td className="px-4 py-3 text-tinta">{l.peca.nome}</td>
                    <td className="px-4 py-3">
                      {l.cor ? (
                        <ChipCor nome={l.cor.nome} hex={l.cor.hex} amostraUrl={l.cor.amostraUrl} malhado={l.cor.malhado} tamanho={16} />
                      ) : (
                        <span className="text-tinta-fraca">sem cor</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-tinta-fraca">
                      {l.distribuicao.length === 0
                        ? '—'
                        : l.distribuicao.map((d) => `${d.quantidade} em ${d.etapa}`).join(' · ')}
                    </td>
                    <td className="px-4 py-3">
                      {l.perdaTotal === 0 ? (
                        <span className="text-tinta-fraca">—</span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <strong className="text-perigo">{l.perdaTotal}</strong>
                          {motivoTopo && (
                            <Etiqueta
                              cor={
                                motivoTopo.valor === MOTIVO_NAO_INFORMADO ? COR_SEM_MOTIVO : COR_TIPO.perda
                              }
                            >
                              {motivoTopo.rotulo}
                            </Etiqueta>
                          )}
                          {l.perdaPorMotivo.length > 1 && (
                            <span className="text-xs text-tinta-fraca">
                              +{l.perdaPorMotivo.length - 1}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-tinta-fraca md:table-cell">{dataBr(l.iniciadoEm)}</td>
                    <td className="px-4 py-3">
                      <Etiqueta cor={s.cor}>{s.rotulo}</Etiqueta>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        aberto={Boolean(detalhe)}
        aoFechar={() => {
          // fechar descarta a edição junto: o rascunho não pode sobreviver
          // para reaparecer em cima do PRÓXIMO lote que a pessoa abrir
          setCapa(null)
          setDetalhe(null)
        }}
        titulo={detalhe ? `${detalhe.codigo} — ${detalhe.peca.nome}` : ''}
        largura="max-w-3xl"
      >
        {detalhe && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-superficie-2 px-3 py-2 text-sm">
              <span className="text-tinta-fraca">
                Inicial <strong className="text-tinta">{detalhe.quantidadeInicial}</strong>
              </span>
              <span className="text-tinta-fraca">
                Agora <strong className="text-tinta">{detalhe.saldoTotal}</strong>
              </span>
              <span className="text-tinta-fraca">
                Perdas <strong className="text-perigo">{detalhe.perdaTotal}</strong>
              </span>
              <span className="text-tinta-fraca">
                Aberto em <strong className="text-tinta">{dataBr(detalhe.iniciadoEm)}</strong>
              </span>
              {detalhe.loteOrigem && (
                <span className="text-tinta-fraca">
                  Veio do <strong className="text-tinta">{detalhe.loteOrigem.codigo}</strong>
                </span>
              )}
            </div>

            {/*
              OBSERVAÇÃO E DATA, QUE ATÉ AQUI NÃO APARECIAM.

              A observação era gravada desde sempre e não tinha nenhuma tela que
              a mostrasse — quem escrevia achava, com razão, que o campo não
              salvava. A data existia e era sempre a do clique.
            */}
            {capa ? (
              <div className="flex flex-col gap-3 rounded-lg border border-borda p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo
                    rotulo="Aberto em"
                    dica="Mudar isto move também o registro de abertura no histórico."
                  >
                    <Input
                      type="date"
                      max={hojeNoAtelie()}
                      value={capa.iniciadoEm}
                      onChange={(e) => setCapa({ ...capa, iniciadoEm: e.target.value })}
                    />
                  </Campo>
                  <Campo
                    rotulo="Abriu com"
                    dica="Para o caso de ter digitado 28 onde eram 30. Subir reabre um lote já concluído."
                  >
                    <InputNumero
                      min={1}
                      valor={capa.quantidade === '' ? null : Number(capa.quantidade)}
                      aoMudar={(n) => setCapa({ ...capa, quantidade: n === null ? '' : String(n) })}
                    />
                  </Campo>
                </div>
                <Campo rotulo="Observação" dica="Aparece no cartão do lote, no quadro.">
                  <Textarea
                    rows={3}
                    maxLength={300}
                    value={capa.observacao}
                    onChange={(e) => setCapa({ ...capa, observacao: e.target.value })}
                  />
                </Campo>
                <div className="flex flex-wrap justify-end gap-2">
                  <Botao variante="secundario" onClick={() => setCapa(null)} disabled={salvandoCapa}>
                    Cancelar
                  </Botao>
                  <Botao onClick={salvarCapa} disabled={salvandoCapa}>
                    {salvandoCapa ? 'Salvando…' : 'Salvar'}
                  </Botao>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm leading-relaxed text-tinta">
                  {detalhe.observacao || <span className="text-tinta-fraca">Sem observação.</span>}
                </p>
                {!detalhe.canceladoEm && (
                  <Botao
                    variante="secundario"
                    onClick={() =>
                      setCapa({
                        observacao: detalhe.observacao ?? '',
                        // vem pronto do servidor, no fuso do ateliê: fatiar o
                        // ISO aqui devolveria o dia seguinte para lote da noite
                        iniciadoEm: detalhe.iniciadoEmDia,
                        quantidade: String(detalhe.quantidadeInicial),
                      })
                    }
                  >
                    <Pencil size={15} /> Editar
                  </Botao>
                )}
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-semibold text-tinta">Onde as peças estão</h3>
              <div className="flex flex-wrap gap-2">
                {detalhe.distribuicao.map((d) => (
                  <span
                    key={d.etapaId}
                    className={`rounded-lg px-2.5 py-1 text-sm ${
                      d.quantidade > 0 ? 'bg-marca/15 text-tinta' : 'bg-superficie-2 text-tinta-fraca'
                    }`}
                  >
                    {d.etapa}: <strong>{d.quantidade}</strong>
                  </span>
                ))}
              </div>
            </div>

            {/*
              POR QUE ESTE LOTE PERDEU.
              O resumo em cima já dizia quantas peças sumiram; o que faltava era
              o diagnóstico, que é o que muda alguma coisa na produção. As barras
              existem porque a comparação entre motivos é o dado — "trincou" e
              "empenou" com 12 e 3 é uma conversa, com 8 e 7 é outra.
            */}
            {detalhe.perdaTotal > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-tinta">Perdas por motivo</h3>
                <ul className="flex flex-col gap-2">
                  {detalhe.perdaPorMotivo.map((m) => (
                    <li key={m.valor}>
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-tinta">{m.rotulo}</span>
                        <span className="shrink-0 text-tinta-fraca">
                          {m.quantidade} · {m.percentual.toLocaleString('pt-BR')}%
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className="mt-1 block h-1.5 overflow-hidden rounded-full bg-superficie-2"
                      >
                        <span
                          className="block h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${m.percentual}%`,
                            backgroundColor:
                              m.valor === MOTIVO_NAO_INFORMADO ? COR_SEM_MOTIVO : COR_TIPO.perda,
                          }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-semibold text-tinta">Movimentos ({detalhe.movimentos.length})</h3>
              <ul className="flex flex-col gap-1.5">
                {detalhe.movimentos.map((m) => (
                  <li key={m.id} className="rounded-lg border border-borda px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Etiqueta cor={COR_TIPO[m.tipo] ?? '#918787'}>{ROTULO_TIPO[m.tipo] ?? m.tipo}</Etiqueta>
                      {/* o motivo tipado fica colado no "perda" porque os dois
                          são a mesma informação: o quê e por quê. O texto livre
                          continua embaixo, com o detalhe do caso. */}
                      {m.tipo === 'perda' && (
                        <Etiqueta cor={m.motivoTipo ? COR_TIPO.perda : COR_SEM_MOTIVO}>
                          {rotuloDoMotivo(m.motivoTipo)}
                        </Etiqueta>
                      )}
                      <strong className="text-tinta">{m.quantidade}</strong>
                      <span className="text-tinta-fraca">
                        {m.etapaOrigem?.nome ?? 'entrada'} → {m.etapaDestino?.nome ?? 'saída'}
                      </span>
                      {m.cor && (
                        <span className="inline-flex items-center gap-1 text-tinta-fraca">
                          <span
                            className="inline-block h-3 w-3 rounded-full border border-borda"
                            style={{ backgroundColor: m.cor.hex }}
                          />
                          {m.cor.nome}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-tinta-fraca">
                      {dataBr(m.criadoEm)} · {m.usuarioNome}
                      {m.responsavel && ` · ${m.responsavel.nome}`}
                      {m.motivo && ` · ${m.motivo}`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {/*
               * Apagar fica ao lado de cancelar de propósito, porque as duas
               * ações são fáceis de confundir e fazem coisas opostas: cancelar
               * transforma o que sobrou em PERDA (e a perda medida entra no
               * plano e no preço); apagar tira o lote do mapa sem tocar em
               * nenhuma conta. Lote de teste é caso de apagar, não de cancelar.
               */}
              <Botao
                variante="secundario"
                onClick={() => {
                  const alvo = detalhe.id
                  setDetalhe(null)
                  setParaApagar(alvo)
                }}
              >
                <Trash2 size={15} /> Apagar lote
              </Botao>
              {!detalhe.canceladoEm && !detalhe.concluidoEm && (
                <Botao
                  variante="perigo"
                  onClick={() => {
                    const alvo = lotes.find((l) => l.id === detalhe.id) ?? null
                    setDetalhe(null)
                    setParaCancelar(alvo)
                  }}
                >
                  Cancelar lote
                </Botao>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        aberto={Boolean(paraCancelar)}
        aoFechar={() => setParaCancelar(null)}
        titulo={`Cancelar ${paraCancelar?.codigo ?? ''}`}
        largura="max-w-md"
      >
        <p className="text-sm text-tinta">
          Tudo que ainda está em produção neste lote vira perda registrada. O histórico continua guardado.
        </p>
        <div className="mt-3">
          <Input
            placeholder="Motivo"
            maxLength={300}
            value={motivoCancelar}
            onChange={(e) => setMotivoCancelar(e.target.value)}
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Botao variante="secundario" onClick={() => setParaCancelar(null)}>
            Voltar
          </Botao>
          <Botao variante="perigo" onClick={cancelar} disabled={!motivoCancelar.trim()}>
            Cancelar lote
          </Botao>
        </div>
      </Modal>

      <ConfirmarExclusaoLote
        loteId={paraApagar}
        aoFechar={() => setParaApagar(null)}
        aoApagar={() => void recarregar()}
      />
    </>
  )
}
