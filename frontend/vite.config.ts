import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Sem isto o service worker novo fica "waiting" e o usuário continua
      // com o bundle antigo até fechar TODAS as abas — o que faz uma correção
      // publicada parecer que não subiu. Já custou tempo depurando um deploy
      // que estava correto.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // woff2 não entra no padrão do workbox. Sem isto, o app abre offline
        // no ateliê com Georgia no lugar da Unna e muda de cara.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      manifest: {
        name: 'Produção Vera Flesch',
        short_name: 'Produção VF',
        description: 'Planejamento e acompanhamento da produção do ateliê',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#F2F1ED',
        theme_color: '#BBA58C',
        icons: [{ src: '/icone.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  server: { port: 5173 },
})
