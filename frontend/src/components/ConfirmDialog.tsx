import { Botao, Modal } from './ui'

/**
 * Confirmação do sistema. NUNCA usar window.confirm: ignora o tema, não
 * funciona no PWA e não dá pra escrever a consequência da ação em pt-BR.
 */
export function ConfirmDialog({
  aberto,
  titulo,
  mensagem,
  textoConfirmar = 'Confirmar',
  perigo = false,
  aoConfirmar,
  aoCancelar,
  ocupado = false,
}: {
  aberto: boolean
  titulo: string
  mensagem: string
  textoConfirmar?: string
  perigo?: boolean
  aoConfirmar: () => void
  aoCancelar: () => void
  ocupado?: boolean
}) {
  return (
    <Modal aberto={aberto} aoFechar={aoCancelar} titulo={titulo} largura="max-w-md">
      <p className="text-sm text-tinta">{mensagem}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Botao variante="secundario" onClick={aoCancelar} disabled={ocupado}>
          Cancelar
        </Botao>
        <Botao variante={perigo ? 'perigo' : 'primario'} onClick={aoConfirmar} disabled={ocupado}>
          {ocupado ? 'Aguarde…' : textoConfirmar}
        </Botao>
      </div>
    </Modal>
  )
}
