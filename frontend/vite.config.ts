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
