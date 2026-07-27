/** Erro de negócio com status HTTP. 409 = conflito, 422 = dado inválido de regra. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public detalhes?: unknown,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const naoEncontrado = (o: string) => new HttpError(404, `${o} não encontrado.`)
export const conflito = (msg: string) => new HttpError(409, msg)
export const invalido = (msg: string, detalhes?: unknown) => new HttpError(422, msg, detalhes)
