import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import process from 'node:process'

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_BUILD': JSON.stringify(process.env.VITE_APP_BUILD || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local'),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'futari-home-apple-touch-icon.png'],
      manifest: {
        name: 'ふたりの暮らし',
        short_name: 'ふたり暮らし',
        description: 'お金、買い物、やりたいこと、ポイントをふたりで共有する家族アプリ',
        theme_color: '#f7f4ee',
        background_color: '#f7f4ee',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'ja',
        categories: ['lifestyle', 'finance', 'shopping'],
        icons: [
          {
            src: '/futari-home-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/futari-home-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/app-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: false,
        globIgnores: ['**/ocr/**'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
