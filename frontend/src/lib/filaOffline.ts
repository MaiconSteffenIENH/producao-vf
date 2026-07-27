import { api } from '../services/api'

/*
 * GRAVAR SEM SINAL.
 *
 * O sistema é PWA porque a Vera e o oleiro usam no ateliê, onde o sinal cai. O
 * service worker já garantia que o app ABRE offline. Gravar, não: o oleiro
 * registrava 40 peças, a requisição morria, e o registro sumia.
 *
 * Isso não é um recurso a mais — é a diferença entre o sistema ser adotado e
 * virar tela que ninguém abre. Basta acontecer duas vezes.
 *
 * COMO FUNCIONA
 *
 * 1. Toda escrita de produção passa por `enviarComFila`.
 * 2. A chave de idempotência é gerada AQUI, antes de sair, e vai junto no corpo.
 *    É o que torna o reenvio seguro: se a requisição chegou mas a resposta se
 *    perdeu, o servidor reconhece a chave e devolve o que já gravou em vez de
 *    gravar de novo. Num livro-razão append-only isso é decisivo — movimento
 *    duplicado não se apaga, se corrige com estorno, e o histórico fica sujo.
 * 3. Falha de rede vai para a fila no localStorage. Falha de REGRA (400/422)
 *    não vai: reenviar "só há 12 peças nesta etapa" mil vezes não conserta nada.
 * 4. A fila reenvia sozinha ao voltar a conexão e a cada 30 s.
 *
 * localStorage e não IndexedDB de propósito: são dezenas de movimentos por dia,
 * cabem de sobra, e é síncrono — o que evita perder a fila num fechamento
 * abrupto do navegador.
 */

const CHAVE = 'vf.fila-offline'
const LIMITE = 200

export type ItemDaFila = {
  chave: string
  metodo: 'post' | 'patch'
  caminho: string
  corpo: Record<string, unknown>
  /** o que mostrar para a pessoa: "Mover 40 de Xícara Andorinha" */
  descricao: string
  criadoEm: number
  tentativas: number
  ultimoErro?: string
}

export const EVENTO_FILA = 'vf:fila-mudou'

function ler(): ItemDaFila[] {
  try {
    const bruto = localStorage.getItem(CHAVE)
    return bruto ? (JSON.parse(bruto) as ItemDaFila[]) : []
  } catch {
    return []
  }
}

function gravar(itens: ItemDaFila[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(itens.slice(-LIMITE)))
  } catch {
    // cota estourada: melhor perder o mais antigo do que travar a tela
    localStorage.setItem(CHAVE, JSON.stringify(itens.slice(-20)))
  }
  window.dispatchEvent(new CustomEvent(EVENTO_FILA))
}

export const filaPendente = (): ItemDaFila[] => ler()

/** Chave única por tentativa de escrita. Gerada no cliente, de propósito. */
export function novaChave(): string {
  const c = globalThis.crypto
  if (c && 'randomUUID' in c) return c.randomUUID()
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Erro de rede (vale reenviar) versus erro de regra (não adianta). */
function ehFalhaDeRede(erro: unknown): boolean {
  const e = erro as { response?: { status?: number }; code?: string }
  if (!e?.response) return true // sem resposta = não chegou lá
  const status = e.response.status ?? 0
  // 5xx e 408/429 são temporários; 4xx de regra, não
  return status >= 500 || status === 408 || status === 429
}

/**
 * Envia agora; se a rede falhar, guarda para reenviar depois.
 *
 * Devolve `{ enfileirado: true }` quando não deu para enviar — a tela usa isso
 * para dizer "guardado, vai subir quando a conexão voltar" em vez de mentir que
 * deu certo ou assustar com erro vermelho.
 */
export async function enviarComFila(
  metodo: 'post' | 'patch',
  caminho: string,
  corpo: Record<string, unknown>,
  descricao: string,
): Promise<{ enfileirado: boolean; dados?: unknown }> {
  const chave = novaChave()
  const comChave = { ...corpo, chaveIdempotencia: chave }

  try {
    const { data } = await api[metodo](caminho, comChave)
    return { enfileirado: false, dados: data }
  } catch (erro) {
    if (!ehFalhaDeRede(erro)) throw erro
    gravar([
      ...ler(),
      {
        chave,
        metodo,
        caminho,
        corpo: comChave,
        descricao,
        criadoEm: Date.now(),
        tentativas: 0,
      },
    ])
    return { enfileirado: true }
  }
}

let enviando = false

/**
 * Tenta esvaziar a fila. Para no primeiro erro de rede — se a conexão caiu,
 * insistir nos outros só gasta bateria.
 */
export async function esvaziarFila(): Promise<{ enviados: number; restantes: number }> {
  if (enviando) return { enviados: 0, restantes: ler().length }
  enviando = true
  let enviados = 0
  try {
    let fila = ler()
    while (fila.length > 0) {
      const item = fila[0]
      try {
        await api[item.metodo](item.caminho, item.corpo)
        fila = fila.slice(1)
        gravar(fila)
        enviados++
      } catch (erro) {
        if (ehFalhaDeRede(erro)) break // conexão ainda ruim: tenta na próxima
        // erro de regra: o movimento não vai passar nunca. Sai da fila com o
        // motivo guardado, senão trava tudo que veio depois dele.
        const e = erro as { response?: { data?: { erro?: string } } }
        fila = fila.slice(1)
        gravar(fila)
        console.warn(
          `[fila] descartado "${item.descricao}": ${e.response?.data?.erro ?? 'recusado pelo servidor'}`,
        )
      }
    }
    return { enviados, restantes: ler().length }
  } finally {
    enviando = false
  }
}

/** Liga o reenvio automático. Chamado uma vez, no App. */
export function iniciarFilaOffline() {
  const tentar = () => void esvaziarFila()
  window.addEventListener('online', tentar)
  const timer = window.setInterval(tentar, 30_000)
  if (navigator.onLine) tentar()
  return () => {
    window.removeEventListener('online', tentar)
    window.clearInterval(timer)
  }
}
