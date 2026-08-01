import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDoErro } from '../services/api'
import { avisar } from '../components/Toaster'
import { Botao, CabecalhoPagina, Campo, Card, Carregando, Etiqueta, Input } from '../components/ui'
import { GRUPOS } from '../components/Layout'
import { MODULOS } from '../lib/modulos'
import { useAuth } from '../store/auth'

/*
 * AJUSTES — a senha de quem entrou e, para quem administra, o que o ateliê usa.
 *
 * Os dois blocos de administração moram AQUI, e não numa tela nova, por um
 * motivo que é regra e não gosto: Ajustes é módulo essencial e nunca some do
 * menu. Uma tela "Módulos" seria ela própria um módulo — desligável, ou
 * escondida por um papel mal configurado — e a chave para religar tudo ficaria
 * trancada do lado de dentro.
 */

/** As mesmas cores de etiqueta do resto do sistema: neutra e a do administrador. */
const COR_NEUTRA = '#918787'
const COR_ADMIN = '#B8963E'

type ModuloDoAtelie = {
  chave: string
  rotulo: string
  grupo: string
  essencial?: boolean
  somenteAdmin?: boolean
  oQuePerde: string
  ativo: boolean
}

type PapelComModulos = {
  id: string
  nome: string
  admin: boolean
  /** `null` = este papel não restringe nada. */
  modulos: string[] | null
}

export function Ajustes() {
  const { perfil, recarregarPerfil } = useAuth()
  const [senhaAtual, setSenhaAtual] = useState('')
  const [senhaNova, setSenhaNova] = useState('')
  const [repetir, setRepetir] = useState('')
  const [salvando, setSalvando] = useState(false)

  const trocar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (senhaNova !== repetir) return avisar.erro('A confirmação não bate com a senha nova.')
    setSalvando(true)
    try {
      await api.post('/auth/trocar-senha', { senhaAtual, senhaNova })
      avisar.ok('Senha trocada.')
      setSenhaAtual('')
      setSenhaNova('')
      setRepetir('')
      await recarregarPerfil()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para trocar a senha.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Ajustes"
        descricao={
          perfil?.admin
            ? 'Seu acesso ao sistema, os módulos que o ateliê usa e o que cada papel enxerga.'
            : 'Seu acesso ao sistema.'
        }
      />

      {perfil?.precisaTrocarSenha && (
        <div className="mb-4 rounded-xl border border-alerta/40 bg-alerta/10 p-4 text-sm text-tinta">
          Sua senha é provisória. Troque agora para liberar o resto do sistema.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-tinta">Trocar senha</h2>
          <form onSubmit={trocar} className="flex flex-col gap-4">
            <Campo rotulo="Senha atual">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
              />
            </Campo>
            <Campo rotulo="Senha nova" dica="Pelo menos 8 caracteres.">
              <Input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={senhaNova}
                onChange={(e) => setSenhaNova(e.target.value)}
              />
            </Campo>
            <Campo rotulo="Repita a senha nova">
              <Input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={repetir}
                onChange={(e) => setRepetir(e.target.value)}
              />
            </Campo>
            <div className="flex justify-end">
              <Botao type="submit" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Trocar senha'}
              </Botao>
            </div>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold text-tinta">Seu acesso</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-fraca">Nome</dt>
              <dd className="text-tinta">{perfil?.nome}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-fraca">E-mail</dt>
              <dd className="truncate text-tinta">{perfil?.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-fraca">Papel</dt>
              <dd className="text-tinta">{perfil?.papel}</dd>
            </div>
            {perfil?.responsavel && (
              <div className="flex justify-between gap-4">
                <dt className="text-tinta-fraca">Responsável na produção</dt>
                <dd className="text-tinta">{perfil.responsavel.nome}</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-xs text-tinta-fraca">
            O tema claro/escuro fica no ícone de lua no topo, e a preferência é lembrada neste aparelho.
          </p>
        </Card>
      </div>

      {perfil?.admin && (
        <div className="mt-4 flex flex-col gap-4">
          <ModulosDoAtelie />
          <AcessoPorPapel />
        </div>
      )}
    </>
  )
}

/**
 * Chave liga/desliga.
 *
 * Botão de 44px de altura com o trilho desenhado dentro: o app é usado em pé,
 * no ateliê, com a mão suja de argila. Uma caixinha de 16px é alvo de mouse.
 */
function Chave({
  ligada,
  desabilitada,
  rotulo,
  aoMudar,
}: {
  ligada: boolean
  desabilitada?: boolean
  rotulo: string
  aoMudar: (ligada: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      aria-label={rotulo}
      disabled={desabilitada}
      onClick={() => aoMudar(!ligada)}
      className="grid h-11 w-14 shrink-0 place-items-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={`relative block h-7 w-12 rounded-full transition-colors duration-200 ${
          ligada ? 'bg-marca' : 'bg-tinta/25'
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-superficie shadow-baixa transition-all duration-200 ${
            ligada ? 'left-6' : 'left-1'
          }`}
        />
      </span>
    </button>
  )
}

function ModulosDoAtelie() {
  const recarregarPerfil = useAuth((e) => e.recarregarPerfil)
  const [modulos, setModulos] = useState<ModuloDoAtelie[] | null>(null)
  const [mexendo, setMexendo] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get('/modulos')
      setModulos(data)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para carregar os módulos.'))
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const alternar = async (modulo: ModuloDoAtelie, ativo: boolean) => {
    setMexendo(modulo.chave)
    try {
      const { data } = await api.put(`/modulos/${modulo.chave}`, { ativo })
      setModulos((lista) => lista?.map((m) => (m.chave === modulo.chave ? { ...m, ativo: data.ativo } : m)) ?? null)
      avisar.ok(ativo ? `${modulo.rotulo} está de volta ao menu.` : `${modulo.rotulo} saiu do menu. Nada foi apagado.`)
      // o pedido era "remover um deve ser refletido não aparecer mais": o menu
      // é montado com o que o /me devolve, então recarregar o perfil aqui faz a
      // lateral mudar na hora, sem ninguém precisar atualizar a página
      await recarregarPerfil()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para mudar o módulo.'))
    } finally {
      setMexendo(null)
    }
  }

  if (!modulos) {
    return (
      <Card>
        <Carregando texto="Carregando os módulos…" />
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-tinta">Módulos do ateliê</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-tinta-fraca">
        Desligar tira a tela do menu e fecha o endereço para todo mundo. Nada é apagado e nenhum cálculo para — o
        planejamento continua contando o que existe. Religar devolve tudo como estava.
      </p>

      <div className="mt-4 flex flex-col gap-5">
        {GRUPOS.map((grupo) => {
          const doGrupo = modulos.filter((m) => m.grupo === grupo.chave)
          if (doGrupo.length === 0) return null
          return (
            <div key={grupo.chave}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-tinta-fraca">
                {grupo.titulo}
              </p>
              <ul className="divide-y divide-borda">
                {doGrupo.map((m) => (
                  <li key={m.chave} className="flex items-start gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-tinta">
                        {m.rotulo}
                        {m.essencial && <Etiqueta cor={COR_NEUTRA}>essencial</Etiqueta>}
                        {m.somenteAdmin && <Etiqueta cor={COR_NEUTRA}>só administração</Etiqueta>}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-tinta-fraca">
                        {m.essencial
                          ? `${m.oQuePerde} A chave fica travada porque o sistema não se sustenta sem esta tela.`
                          : m.oQuePerde}
                      </p>
                    </div>
                    <Chave
                      ligada={m.ativo}
                      desabilitada={m.essencial === true || mexendo !== null}
                      rotulo={`${m.ativo ? 'Desligar' : 'Ligar'} ${m.rotulo}`}
                      aoMudar={(ativo) => void alternar(m, ativo)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/** Todas as chaves de hoje — o ponto de partida de quem ainda não restringe nada. */
const TODAS_AS_CHAVES = MODULOS.map((m) => m.chave)

/**
 * Marcar TODOS os módulos de hoje vira "sem restrição", e não uma lista com 21
 * itens.
 *
 * A diferença não é cosmética: a lista de hoje não conhece o módulo de amanhã,
 * então o papel congelaria no catálogo desta semana e o recurso novo nasceria
 * invisível para ele. Quem marcou tudo quis dizer "este papel vê tudo" — é isso
 * que fica gravado. Os essenciais ficam de fora da conta porque eles aparecem
 * marcados ou não; exigi-los na comparação deixaria o papel preso em "restrito"
 * mesmo com a tela inteira marcada.
 */
function semRestricaoSeMarcouTudo(lista: string[]): string[] | null {
  const naoEssenciais = MODULOS.filter((m) => !m.essencial)
  return naoEssenciais.every((m) => lista.includes(m.chave)) ? null : lista
}

function mesmaLista(a: string[] | null, b: string[] | null): boolean {
  if (a === null || b === null) return a === b
  return a.length === b.length && a.every((c) => b.includes(c))
}

function AcessoPorPapel() {
  const recarregarPerfil = useAuth((e) => e.recarregarPerfil)
  const [papeis, setPapeis] = useState<PapelComModulos[] | null>(null)
  const [rascunhos, setRascunhos] = useState<Record<string, string[] | null>>({})
  const [salvando, setSalvando] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get<PapelComModulos[]>('/papeis')
      setPapeis(data)
      setRascunhos(Object.fromEntries(data.map((p) => [p.id, p.modulos])))
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para carregar os papéis.'))
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const alternarModulo = (papelId: string, chave: string, marcado: boolean) => {
    setRascunhos((r) => {
      // papel sem restrição parte de "tudo marcado", porque é isso que ele
      // enxerga hoje — as caixinhas mostram a realidade, e desmarcar a primeira
      // é o gesto que começa a restringir
      const base = r[papelId] ?? TODAS_AS_CHAVES
      const nova = marcado ? [...new Set([...base, chave])] : base.filter((c) => c !== chave)
      return { ...r, [papelId]: semRestricaoSeMarcouTudo(nova) }
    })
  }

  const salvar = async (papel: PapelComModulos) => {
    setSalvando(papel.id)
    try {
      await api.put(`/papeis/${papel.id}/modulos`, { modulos: rascunhos[papel.id] ?? null })
      avisar.ok(`O que o papel ${papel.nome} enxerga foi salvo.`)
      await carregar()
      // se o papel mexido for o de quem está na tela, o menu muda agora
      await recarregarPerfil()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para salvar o acesso do papel.'))
    } finally {
      setSalvando(null)
    }
  }

  if (!papeis) {
    return (
      <Card>
        <Carregando texto="Carregando os papéis…" />
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-tinta">O que cada papel enxerga</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-tinta-fraca">
        Desmarque o que aquele grupo de pessoas não precisa ver. Módulo desligado acima não aparece para ninguém,
        marcado ou não.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {papeis.map((papel) => {
          const rascunho = rascunhos[papel.id] ?? null
          const mudou = !mesmaLista(rascunho, papel.modulos)
          const ocupado = salvando === papel.id
          return (
            <div key={papel.id} className="rounded-xl border border-borda p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-tinta">{papel.nome}</h3>
                {papel.admin && <Etiqueta cor={COR_ADMIN}>administração</Etiqueta>}
              </div>

              <p className="mt-1 text-xs leading-relaxed text-tinta-fraca">
                {rascunho === null
                  ? 'Sem nenhuma marcação, este papel enxerga tudo o que estiver ligado — inclusive os módulos que ' +
                    'entrarem no sistema depois de hoje. Desmarcar qualquer item aqui embaixo começa a restringir.'
                  : 'Este papel enxerga só o que está marcado. Os essenciais continuam aparecendo de qualquer jeito: ' +
                    'sem eles a pessoa entraria e não teria para onde ir.'}
              </p>
              {papel.admin && (
                <p className="mt-1 text-xs leading-relaxed text-alerta">
                  Papel de administração: o que for desmarcado aqui some também para quem administra — inclusive para
                  você, se este for o seu papel.
                </p>
              )}

              <div className="mt-3 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                {MODULOS.map((m) => (
                  <label
                    key={m.chave}
                    className="flex min-h-11 items-center gap-2.5 py-1 text-sm text-tinta has-[:disabled]:text-tinta-fraca"
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 accent-[var(--color-marca)]"
                      checked={m.essencial === true || rascunho === null || rascunho.includes(m.chave)}
                      disabled={m.essencial === true || ocupado}
                      onChange={(e) => alternarModulo(papel.id, m.chave, e.target.checked)}
                    />
                    <span className="min-w-0">
                      {m.rotulo}
                      {m.essencial && <span className="block text-xs text-tinta-fraca">essencial, ninguém perde</span>}
                      {m.somenteAdmin && !papel.admin && (
                        <span className="block text-xs text-tinta-fraca">só aparece em papel de administração</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Botao
                  type="button"
                  variante="secundario"
                  disabled={ocupado || rascunho === null}
                  onClick={() => setRascunhos((r) => ({ ...r, [papel.id]: null }))}
                >
                  Liberar tudo
                </Botao>
                <Botao type="button" disabled={ocupado || !mudou} onClick={() => void salvar(papel)}>
                  {ocupado ? 'Salvando…' : 'Salvar'}
                </Botao>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
