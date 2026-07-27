import { criarApp } from './app'

const porta = Number(process.env.PORT ?? 3001)

criarApp().listen(porta, () => {
  console.log(`Produção VF — API no ar em http://localhost:${porta}`)
})
