import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { api, mensagemDoErro } from '../services/api'
import { avisar } from './Toaster'
import { Botao, ChipCor, Modal } from './ui'
import { plural } from '../lib/format'

/*
 * APAGAR UM LOTE.
 *
 * O sistema não apaga movimento — o saldo É o histórico. Mas lote aberto por
 * engano não é erro de registro: é registro que nunca deveria ter existido, e
 * mantê-lo para sempre é ruído, não integridade.
 *
 * Por que não é o "Cancelar" que já existia: cancelar joga o saldo restante
 * como PERDA, e a perda medida da peça entra na quantidade que o planejamento
 * manda produzir e no custo real da precificação. Limpar lote de teste com
 * "cancelar" encareceria o produto sem ninguém perceber.
 *
 * A confirmação busca do servidor o que some junto ANTES de apagar. É a única
 * proteção que sobra quando a ação é irreversível: mostrar o tamanho do
 * estrago com o dedo ainda longe do botão.
 */

type Previa = {
  id: string
  codigo: string
  peca: string
  cor: { nome: string; hex: string } | null
  quantidadeInicial: number
  saldo: number
  movimentos: number
  pode: boolean
  impedimento: string | null
  avisos: string[]
}

export function ConfirmarExclusaoLote({
  loteId,
  aoFechar,
  aoApagar,
}: {
  /** null mantém o diálogo fechado */
  loteId: string | null
  aoFechar: () => void
  /** chamado depois de apagar, para a tela recarregar */
  aoApagar: () => void
}) {
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [apagando, setApagando] = useState(false)

  const buscar = useCallback(async (id: string) => {
    setCarregando(true)
    setPrevia(null)
    try {
      const { data } = await api.get(`/lotes/${id}/exclusao`)
      setPrevia(data)
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para ver o que este lote levaria junto.'))
      aoFechar()
    } finally {
      setCarregando(false)
    }
  }, [aoFechar])

  useEffect(() => {
    if (loteId) void buscar(loteId)
  }, [loteId, buscar])

  const apagar = async () => {
    if (!loteId || !previa) return
    setApagando(true)
    try {
      // de propósito FORA da fila offline: apagar não pode ser reenviado mais
      // tarde contra um lote que já mudou de mãos nesse meio-tempo
      await api.delete(`/lotes/${loteId}`)
      avisar.ok(`Lote ${previa.codigo} apagado.`)
      aoFechar()
      aoApagar()
    } catch (erro) {
      avisar.erro(mensagemDoErro(erro, 'Não deu para apagar o lote.'))
    } finally {
      setApagando(false)
    }
  }

  return (
    <Modal
      aberto={loteId !== null}
      aoFechar={aoFechar}
      titulo={previa ? `Apagar ${previa.codigo}` : 'Apagar lote'}
      largura="max-w-lg"
    >
      {carregando && <p className="text-sm text-tinta-fraca">Vendo o que este lote levaria junto…</p>}

      {previa && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-borda bg-superficie-2 px-4 py-3">
            <p className="font-medium text-tinta">
              {previa.peca} · {previa.codigo}
            </p>
            {previa.cor && (
              <div className="mt-1">
                <ChipCor nome={previa.cor.nome} hex={previa.cor.hex} tamanho={13} />
              </div>
            )}
            <p className="mt-1 text-sm text-tinta-fraca">
              {plural(previa.quantidadeInicial, 'peça')} na abertura ·{' '}
              {previa.saldo > 0 ? `${plural(previa.saldo, 'peça')} ainda em produção` : 'nada em produção'}
            </p>
          </div>

          {!previa.pode ? (
            <p className="flex items-start gap-2 rounded-xl border border-alerta/30 bg-alerta/5 px-4 py-3 text-sm leading-relaxed text-tinta">
              <AlertTriangle size={17} className="mt-0.5 shrink-0 text-alerta" />
              <span>{previa.impedimento}</span>
            </p>
          ) : (
            <>
              {previa.avisos.length > 0 && (
                <div className="rounded-xl border border-alerta/30 bg-alerta/5 px-4 py-3">
                  <p className="mb-1.5 flex items-center gap-2 text-sm font-medium text-alerta">
                    <AlertTriangle size={16} /> O que some junto
                  </p>
                  <ul className="flex flex-col gap-1 text-sm leading-relaxed text-tinta">
                    {previa.avisos.map((aviso, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-alerta">·</span>
                        <span>{aviso}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-sm leading-relaxed text-tinta-fraca">
                Apagar é diferente de cancelar: o lote some do banco e{' '}
                <strong className="text-tinta">não volta</strong>. Em compensação, nada dele vira perda —
                a taxa de perda da peça, o planejamento e o preço ficam como estavam. Quem apagou e quando
                fica registrado no log de atividade.
              </p>
            </>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Botao variante="secundario" onClick={aoFechar} disabled={apagando}>
              {previa.pode ? 'Cancelar' : 'Fechar'}
            </Botao>
            {previa.pode && (
              <Botao variante="perigo" onClick={apagar} disabled={apagando}>
                <Trash2 size={15} /> {apagando ? 'Apagando…' : 'Apagar para sempre'}
              </Botao>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
