import { useEffect } from 'react'

export const EVENTO_ATUALIZAR = 'vf:atualizar'

/**
 * Recarrega a listagem quando a janela volta ao foco e quando o usuário puxa
 * pra atualizar. O loader recebe `silencioso` — NUNCA passe o loader direto
 * como handler de evento, senão o evento vira o parâmetro e a tela pisca.
 * Certo:  useAutoRefresh(() => recarregar(true))
 * Errado: useAutoRefresh(recarregar)
 */
export function useAutoRefresh(recarregar: () => void, opcoes?: { aoVivo?: boolean; intervaloMs?: number }) {
  useEffect(() => {
    const aoFocar = () => {
      if (document.visibilityState === 'visible') recarregar()
    }
    document.addEventListener('visibilitychange', aoFocar)
    window.addEventListener('focus', aoFocar)
    window.addEventListener(EVENTO_ATUALIZAR, aoFocar)

    let timer: ReturnType<typeof setInterval> | undefined
    if (opcoes?.aoVivo) timer = setInterval(aoFocar, opcoes.intervaloMs ?? 5000)

    return () => {
      document.removeEventListener('visibilitychange', aoFocar)
      window.removeEventListener('focus', aoFocar)
      window.removeEventListener(EVENTO_ATUALIZAR, aoFocar)
      if (timer) clearInterval(timer)
    }
  }, [recarregar, opcoes?.aoVivo, opcoes?.intervaloMs])
}
