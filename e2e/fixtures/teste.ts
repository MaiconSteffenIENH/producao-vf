import { test as base, expect, request } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { Api } from './api'
import { ARQUIVO_ESTADO, URL_API } from './ambiente'

type Fixtures = {
  /** cliente da API já autenticado com o mesmo token da tela */
  api: Api
  /** o chromium sem interface de rede diz `navigator.onLine = false`; a emulação corrige */
  redeLigada: void
}

export const test = base.extend<Fixtures>({
  redeLigada: [
    async ({ context }, use) => {
      await context.setOffline(false)
      await use()
    },
    { auto: true },
  ],
  api: async ({}, use) => {
    const estado = JSON.parse(readFileSync(ARQUIVO_ESTADO, 'utf8')) as {
      origins: { localStorage: { name: string; value: string }[] }[]
    }
    const token = estado.origins[0].localStorage.find((i) => i.name === 'vf.token')!.value
    const ctx = await request.newContext({
      baseURL: URL_API,
      extraHTTPHeaders: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    })
    await use(new Api(ctx))
    await ctx.dispose()
  },
})

export { expect }
