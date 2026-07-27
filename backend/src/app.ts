import compression from 'compression'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { tratarErros } from './middlewares/erros'
import { rotas } from './routes'

export function criarApp() {
  const app = express()

  app.set('trust proxy', 1) // Render fica atrás de proxy — necessário pro rate limit
  app.use(helmet())
  app.use(compression())
  app.use(
    cors({
      origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((o) => o.trim()),
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '1mb' }))

  // Força bruta no login é o único ponto realmente exposto
  app.use(
    '/auth/login',
    rateLimit({ windowMs: 10 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }),
  )

  app.use(rotas)

  app.use((_req, res) => res.status(404).json({ mensagem: 'Rota não encontrada.' }))
  app.use(tratarErros)

  return app
}
