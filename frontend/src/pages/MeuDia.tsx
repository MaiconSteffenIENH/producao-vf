import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDoErro } from '../services/api'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { avisar } from '../components/Toaster'
import { CalendarOff } from 'lucide-react'
import { Botao, CabecalhoPagina, Card, Carregando, Etiqueta, SelecaoBuscavel, Vazio } from '../components/ui'
import { useAuth } from '../store/auth'

type Agenda = {
  responsavel: { id: string; nome: string; cor: string; tipo: string }
  capacidadeDiaria: number
  saldoAnterior: number
  metaDeHoje: number
  feitoHoje: number
  faltaHoje: number
  feitoNaSemana: number
  esperadoNaSemana: number
  folgaHoje: boolean
  diasCobrados: number
  folgas: { data: string; motivo: string }[]
  explicacao: string
  fila: {
    loteId: string
    codigo: string
    peca: string
    cor: string | null
    corHex: string | null
    etapa: string
    quantidade: number
  }[]
}

function Barra({ feito, meta }: { feito: number; meta: number }) {
  const pct = meta > 0 ? Math.min(100, Math.round((feito / meta) * 100)) : 0
  return (
    <div className="mt-2">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-superficie-2">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#3E5C4B' : '#BBA58C' }}
        />
      </div>
      <p className="mt-1 text-xs text-tinta-fraca">
        {feito} de {meta} ({pct}%)
      </p>
    </div>
  )
}

function CartaoAgenda({ agenda, aoMarcarFolga }: { agenda: Agenda; aoMarcarFolga: (id: string) => void }) {
  const { saldoAnterior, metaDeHoje, feitoHoje, faltaHoje } = agenda
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-titulo text-xl text-tinta">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: agenda.responsavel.cor }} />
          {agenda.responsavel.nome}
        </h2>
        {saldoAnterior < 0 ? (
          <Etiqueta cor="#B4703A">{Math.abs(saldoAnterior)} atrasadas na semana</Etiqueta>
        ) : saldoAnterior > 0 ? (
          <Etiqueta cor="#3E5C4B">{saldoAnterior} adiantadas</Etiqueta>
        ) : null}
      </div>

      {agenda.folgaHoje && (
        <p className="mt-3 rounded-xl border border-verde/25 bg-verde/8 px-3.5 py-2.5 text-sm text-tinta">
          Folga hoje. A meta não corre e nada vira dívida.
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-3">
        {[
          ['Meta de hoje', metaDeHoje],
          ['Feito hoje', feitoHoje],
          ['Falta', faltaHoje],
        ].map(([rotulo, valor]) => (
          <div key={String(rotulo)} className="rounded-xl bg-superficie-2 p-3.5">
            <p className="font-titulo text-2xl leading-none text-tinta">{valor}</p>
            <p className="mt-1.5 text-xs text-tinta-fraca">{rotulo}</p>
          </div>
        ))}
      </div>

      <Barra feito={feitoHoje} meta={metaDeHoje} />
      <p className="mt-2 text-xs text-tinta-fraca">{agenda.explicacao}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Botao variante="secundario" onClick={() => aoMarcarFolga(agenda.responsavel.id)}>
          <CalendarOff size={14} /> Marcar folga hoje
        </Botao>
        {(agenda.folgas ?? []).length > 0 && (
          <span className="text-xs text-tinta-fraca">
            {agenda.folgas.length} {agenda.folgas.length === 1 ? 'folga' : 'folgas'} nesta semana
          </span>
        )}
      </div>

      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold text-tinta">Na fila ({agenda.fila.length})</h3>
        {agenda.fila.length === 0 ? (
          <p className="text-sm text-tinta-fraca">Nada parado nas etapas desta pessoa.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {agenda.fila.map((f) => (
              <li
                key={`${f.loteId}-${f.etapa}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-superficie-2 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {f.corHex && (
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full border border-borda"
                      style={{ backgroundColor: f.corHex }}
                    />
                  )}
                  <span className="truncate text-tinta">
                    {f.peca}
                    {f.cor ? ` · ${f.cor}` : ''}
                  </span>
                  <span className="shrink-0 text-xs text-tinta-fraca">{f.codigo}</span>
                </span>
                <span className="shrink-0 text-tinta-fraca">
                  {f.quantidade} em {f.etapa}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

export function MeuDia() {
  const perfil = useAuth((e) => e.perfil)
  const [agendas, setAgendas] = useState<Agenda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [foco, setFoco] = useState('')

  const recarregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const { data } = await api.get('/agenda')
      setAgendas(data)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para carregar o dia.'))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  // se a pessoa logada está ligada a um responsável, o dia dela abre primeiro
  useEffect(() => {
    if (perfil?.responsavel?.id) setFoco(perfil.responsavel.id)
  }, [perfil?.responsavel?.id])

  useAutoRefresh(useCallback(() => void recarregar(true), [recarregar]), { aoVivo: true, intervaloMs: 30_000 })

  /*
   * Folga é o que impede o saldo rolante de cobrar dia em que ninguém estava
   * no ateliê. Sem isso, faltar na quarta deixava a meta de quinta impossível
   * e a dívida não era da pessoa.
   */
  const marcarFolga = async (responsavelId: string) => {
    const hoje = new Date()
    const data = new Date(hoje.getTime() - hoje.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 10)
    try {
      await api.post('/folgas', { responsavelId, data, motivo: 'folga' })
      avisar.ok('Folga registrada. A meta de hoje não corre.')
      await recarregar(true)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para registrar a folga.'))
    }
  }

  if (carregando) return <Carregando />

  const visiveis = foco ? agendas.filter((a) => a.responsavel.id === foco) : agendas

  return (
    <>
      <CabecalhoPagina
        titulo="Tarefas do dia"
        descricao="A meta considera a semana: o que não saiu ontem soma hoje, o que passou abate."
        acoes={
          <div className="w-full sm:w-56">
            <SelecaoBuscavel
              valor={foco}
              aoEscolher={setFoco}
              limpavel
              placeholder="Todo mundo"
              vazio="Ninguém com esse nome."
              opcoes={agendas.map((a) => ({ valor: a.responsavel.id, rotulo: a.responsavel.nome }))}
            />
          </div>
        }
      />

      {visiveis.length === 0 ? (
        <Vazio
          titulo="Ninguém com meta cadastrada"
          descricao="Preencha a capacidade diária no cadastro de responsáveis para a meta aparecer aqui."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visiveis.map((a) => (
            <CartaoAgenda key={a.responsavel.id} agenda={a} aoMarcarFolga={marcarFolga} />
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-tinta-fraca">
        O realizado sai dos movimentos registrados na produção — ninguém digita quanto fez. O saldo zera toda
        segunda, de propósito: dívida acumulada de mês inteiro vira número que ninguém olha. Dia de folga não é
        cobrado — sem isso, faltar na quarta tornaria a meta de quinta impossível por uma dívida que não é da
        pessoa.
      </p>
    </>
  )
}
