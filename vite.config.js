import { defineConfig } from 'vite'
import autoprefixer from 'autoprefixer'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Plugin local: copia los iconos PWA al dist/
function copyPwaIcons() {
  return {
    name: 'copy-pwa-icons',
    closeBundle() {
      const src = resolve(__dirname, 'public')
      const dst = resolve(__dirname, 'dist')
      try { mkdirSync(dst, { recursive: true }) } catch {}
      for (const f of ['pwa-512.png', 'pwa-192.png', 'apple-touch-icon.png']) {
        try { copyFileSync(`${src}/${f}`, `${dst}/${f}`) } catch {}
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  // No publicDir — our source lives in public/, which Vite must process
  publicDir: false,

  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Registro GLP',
        short_name: 'Registro GLP',
        description: 'Sistema de registro y control de conversiones GLP',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
    copyPwaIcons(),
  ],

  css: {
    postcss: {
      plugins: [
        autoprefixer(),
      ],
    },
  },

  server: {
    // Proxy API calls to Express backend during development
    proxy: {
      '/api': 'http://localhost:3000',
      '/ping': 'http://localhost:3000',
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
