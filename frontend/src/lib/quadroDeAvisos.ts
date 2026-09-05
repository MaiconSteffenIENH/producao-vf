import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

/*
 * O ALERTA DO QUADRO NO MENU LATERAL.
 *
 * Quem precisa do aviso é justamente quem NÃO está na tela de avisos. O João
 * fica o dia no quadro de produção, e foi assim que uma bandeja de tortinha e
 * duas xícaras ficaram para trás. Por isso o estado é consultado de fora da
 * tela, em toda página do sistema.
 *
 * É a consulta mais frequente do app inteiro, e por isso ela é MAGRA: o
 * endpoint devolve quatro números, não o quadro. Puxar os cards para decidir
 * uma cor gastaria banda de graça no 4G do ateliê.
 */

export type AlertaDoQuadro = 'nenhum' | 'programado' | 'vence_hoje' | 'atrasado'

export type ResumoDoQuadro = {
  alerta: AlertaDoQuadro
  abertos: number
  venceHoje: number
  atrasados: number
  piorAtraso: number
}

const VAZIO: ResumoDoQuadro = {
  alerta: 'nenhum',
  abertos: 0,
  venceHoje: 0,
  atrasados: 0,
  piorAtraso: 0,
}

/** Evento local: a tela de avisos avisa o menu sem esperar o próximo minuto. */
const EVENTO_QUADRO = 'vf:quadro-de-avisos'

export const avisarQuadroMudou = () => window.dispatchEvent(new Event(EVENTO_QUADRO))

/**
 * Um minuto.
 *
 * O que a consulta persegue é a virada do dia: o card que vence hoje precisa
 * ficar vermelho sozinho, na tela de quem deixou o app aberto desde ontem. Um
 * minuto de atraso nessa virada não muda decisão nenhuma, e segundos
 * multiplicariam a requisição por sessenta sem ninguém notar diferença.
 */
const INTERVALO_MS = 60_000

/**
 * O resumo do quadro, para quem desenha o menu.
 *
 * `ativo` desliga tudo quando o módulo de avisos não está visível para esta
 * pessoa: sem isso, o app bateria a cada minuto numa rota que responde 403,
 * enchendo o log de auditoria de tentativa barrada que ninguém fez.
 */
export function useResumoDoQuadro(ativo: boolean): ResumoDoQuadro {
  const [resumo, setResumo] = useState<ResumoDoQuadro>(VAZIO)

  /*
   * A referência evita corrida entre respostas.
   *
   * Voltar o foco enquanto o intervalo já disparou põe duas requisições no ar,
   * e a mais lenta pode chegar por último com o dado mais velho — o menu
   * voltaria para o amarelo depois de já ter mostrado o vermelho.
   */
  const versao = useRef(0)

  const buscar = useCallback(async () => {
    if (!ativo) return
    const minha = ++versao.current
    try {
      const { data } = await api.get('/avisos/resumo')
      if (minha === versao.current) setResumo(data)
    } catch {
      /*
       * Silêncio de propósito. Isto roda em toda tela, a cada minuto: uma
       * falha de rede aqui não é assunto da pessoa, que está no meio de outra
       * coisa. O último resumo bom continua na tela até a próxima resposta.
       */
    }
  }, [ativo])

  useEffect(() => {
    if (!ativo) {
      setResumo(VAZIO)
      return
    }
    void buscar()

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void buscar()
    }
    const timer = setInterval(() => void buscar(), INTERVALO_MS)
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    window.addEventListener(EVENTO_QUADRO, aoVoltar)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('focus', aoVoltar)
      window.removeEventListener(EVENTO_QUADRO, aoVoltar)
    }
  }, [ativo, buscar])

  return resumo
}

/**
 * Como o item do menu se pinta.
 *
 * Três estados, e não dois, porque "vence hoje" e "já passou" pedem reações
 * diferentes: no primeiro ainda dá para despachar antes das 17h; no segundo a
 * conversa é outra, com o cliente. Um vermelho só para os dois casos ensinaria
 * a equipe a tratar os dois do mesmo jeito.
 *
 * `titulo` vira o `title` do link: quem passa o mouse descobre o motivo da cor
 * sem precisar abrir a tela.
 */
export function pinturaDoMenu(resumo: ResumoDoQuadro): {
  classe: string
  classeAtivo: string
  badge: string
  classeBadge: string
  pulsa: boolean
  titulo: string
} | null {
  if (resumo.alerta === 'nenhum' || resumo.abertos === 0) return null

  if (resumo.alerta === 'atrasado') {
    return {
      // sólido: o atraso é o único estado que precisa ser visto de longe, com
      // o celular na bancada e a pessoa em pé. Contraste 7,2:1 no claro.
      classe: 'bg-perigo text-contraste',
      classeAtivo: 'bg-perigo text-contraste',
      badge: String(resumo.atrasados),
      // invertido: número vermelho sobre pastilha clara. Branco sobre vermelho
      // translúcido perderia o contraste que o sólido acabou de conquistar.
      classeBadge: 'bg-contraste text-perigo',
      pulsa: true,
      titulo:
        resumo.atrasados === 1
          ? `1 aviso passou do prazo há ${resumo.piorAtraso === 1 ? '1 dia' : `${resumo.piorAtraso} dias`}`
          : `${resumo.atrasados} avisos passaram do prazo`,
    }
  }

  if (resumo.alerta === 'vence_hoje') {
    return {
      /*
       * Fundo mais forte E contorno, porque a 14% ele ficava indistinguível do
       * âmbar do estado programado: os dois viravam o mesmo bege claro na
       * lateral, e só o número da pastilha os separava. Quem olha o menu de
       * relance não lê o número.
       *
       * Contraste do rótulo aqui: 5,72:1 no claro, 10,60:1 no escuro.
       */
      classe: 'bg-perigo/22 text-tinta ring-1 ring-inset ring-perigo/50',
      classeAtivo: 'bg-marca text-contraste ring-2 ring-perigo/60',
      badge: String(resumo.venceHoje),
      classeBadge: 'bg-perigo text-contraste',
      pulsa: false,
      titulo: resumo.venceHoje === 1 ? '1 aviso vence hoje' : `${resumo.venceHoje} avisos vencem hoje`,
    }
  }

  return {
    /*
     * O RÓTULO FICA EM `text-tinta`, E NÃO NA COR DO ALERTA.
     *
     * Cor sobre a própria cor translúcida é a mesma armadilha que já derrubou
     * o botão principal deste sistema (areia sobre areia, 3,09:1). Aqui o âmbar
     * (#a66836) sobre alerta/12 na lateral clara dá 4,20:1, e o vermelho dá
     * 4,30:1 — os dois abaixo dos 4,5 exigidos.
     *
     * Quem carrega a cor é o fundo e a pastilha, que não precisam passar em
     * contraste de texto. O rótulo em tinta dá 6,89:1 e continua legível.
     */
    classe: 'bg-alerta/12 text-tinta',
    classeAtivo: 'bg-marca text-contraste ring-2 ring-alerta/60',
    badge: String(resumo.abertos),
    classeBadge: 'bg-alerta text-contraste',
    pulsa: false,
    titulo: resumo.abertos === 1 ? '1 aviso em aberto' : `${resumo.abertos} avisos em aberto`,
  }
}
