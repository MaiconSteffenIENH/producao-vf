import { Component, type ReactNode } from 'react'
import { Botao } from './ui'

/** Impede que um erro de render derrube a tela inteira em branco no celular. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null }

  static getDerivedStateFromError(erro: Error) {
    return { erro }
  }

  componentDidCatch(erro: Error) {
    console.error('[erro de tela]', erro)
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold text-tinta">Algo quebrou nesta tela</h1>
        <p className="max-w-md text-sm text-tinta-fraca">
          O erro foi registrado no console. Recarregar costuma resolver; se voltar, avise o Maicon.
        </p>
        <Botao onClick={() => location.reload()}>Recarregar</Botao>
      </div>
    )
  }
}
