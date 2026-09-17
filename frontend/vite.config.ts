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
        /*
         * O QUADRO CONSULTÁVEL SEM SINAL.
         *
         * O app abria offline, mas abria vazio: o quadro é o que a equipe mais
         * olha, e olhar é a metade que não precisa de rede. As leituras que o
         * quadro faz ficam guardadas; sem sinal (ou com sinal que não responde
         * em 8 s), o service worker devolve a última cópia e marca a hora em
         * `x-vf-guardado-em`, que a tela lê para dizer "quadro de 14:32".
         *
         * Só GET e só a API (outra origem): a navegação do próprio app tem o
         * seu fallback. Escrita nunca passa por aqui, é da fila offline.
         */
        runtimeCaching: [
          {
            urlPattern: ({ url, request, sameOrigin }) =>
              request.method === 'GET' &&
              !sameOrigin &&
              /^\/(lotes\/kanban|etapas|cores|pecas|responsaveis|auth\/me)(\?|$)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'vf-leituras',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 40, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
              plugins: [
                {
                  // a cópia guardada leva a hora em que foi vista; a resposta da rede, não
                  cacheWillUpdate: async ({ response }) => {
                    if (!response || response.status !== 200) return null
                    const cabecalhos = new Headers(response.headers)
                    cabecalhos.set('x-vf-guardado-em', new Date().toISOString())
                    return new Response(await response.clone().arrayBuffer(), {
                      status: 200,
                      statusText: response.statusText,
                      headers: cabecalhos,
                    })
                  },
                },
              ],
            },
          },
        ],
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
