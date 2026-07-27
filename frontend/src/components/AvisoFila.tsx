import { useEffect, useState } from 'react'
import { CloudOff, RefreshCw, WifiOff } from 'lucide-react'
import { EVENTO_FILA, esvaziarFila, filaPendente, type ItemDaFila } from '../lib/filaOffline'

/*
 * A barra que aparece quando há registro esperando a conexão voltar.
 *
 * Ela existe por uma razão de confiança: sem ela, o oleiro registra 40 peças
 * sem sinal, o número não aparece no quadro, e ele conclui que o sistema comeu
 * o trabalho dele. Aqui ele vê onde o registro está, e que ninguém perdeu nada.
 *
 * Some sozinha quando a fila esvazia — aviso permanente vira paisagem.
 */
export function AvisoFila() {
  const [fila, setFila] = useState<ItemDaFila[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    const atualizar = () => setFila(filaPendente())
    atualizar()
    window.addEventListener(EVENTO_FILA, atualizar)
    const aoMudarRede = () => setOnline(navigator.onLine)
    window.addEventListener('online', aoMudarRede)
    window.addEventListener('offline', aoMudarRede)
    return () => {
      window.removeEventListener(EVENTO_FILA, atualizar)
      window.removeEventListener('online', aoMudarRede)
      window.removeEventListener('offline', aoMudarRede)
    }
  }, [])

  const tentarAgora = async () => {
    setEnviando(true)
    try {
      await esvaziarFila()
    } finally {
      setEnviando(false)
      setFila(filaPendente())
    }
  }

  // offline sem nada pendente: um aviso discreto, porque ainda dá para navegar
  if (fila.length === 0) {
    if (online) return null
    return (
      <div className="anima-aparecer flex items-center gap-2 rounded-xl border border-borda bg-superficie-2 px-3.5 py-2 text-sm text-tinta-fraca">
        <WifiOff size={16} className="shrink-0" />
        Sem conexão. Dá para olhar tudo; o que você registrar fica guardado até a rede voltar.
      </div>
    )
  }

  return (
    <div className="anima-surgir mb-4 rounded-2xl border border-alerta/30 bg-alerta/8 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-tinta">
          <CloudOff size={17} className="shrink-0 text-alerta" />
          {fila.length === 1
            ? '1 registro esperando a conexão'
            : `${fila.length} registros esperando a conexão`}
        </p>
        <button
          onClick={tentarAgora}
          disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded-lg border border-borda bg-superficie px-3 py-1.5 text-sm text-tinta transition hover:border-marca-clara disabled:opacity-60"
        >
          <RefreshCw size={14} className={enviando ? 'animate-spin' : ''} />
          {enviando ? 'Enviando…' : 'Tentar agora'}
        </button>
      </div>
      <ul className="mt-2 flex flex-col gap-0.5">
        {fila.slice(0, 4).map((item) => (
          <li key={item.chave} className="truncate text-xs text-tinta-fraca">
            {item.descricao}
          </li>
        ))}
        {fila.length > 4 && (
          <li className="text-xs text-tinta-fraca">e mais {fila.length - 4}…</li>
        )}
      </ul>
      <p className="mt-2 text-xs text-tinta-fraca">
        Nada foi perdido. Sobe sozinho quando a rede voltar, e sem duplicar o que já entrou.
      </p>
    </div>
  )
}
