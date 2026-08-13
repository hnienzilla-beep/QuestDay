import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/QuestDay/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Die Registrierung übernimmt src/features/pwa/appUpdates.ts, damit dort zusätzlich
      // beim Zurückkehren in die App auf einen neuen Stand geprüft werden kann. Ohne das
      // hier stünde daneben noch das automatisch eingefügte Skript.
      injectRegister: null,
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'ToDo',
        short_name: 'ToDo',
        description: 'Cleaner Aufgaben-Planer mit Wochenkalender und Zielen',
        lang: 'de',
        start_url: '/QuestDay/',
        scope: '/QuestDay/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#000000',
        background_color: '#000000',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      },
    }),
  ],
})
