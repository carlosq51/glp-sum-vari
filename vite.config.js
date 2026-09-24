import { defineConfig } from 'vite'
import autoprefixer from 'autoprefixer'
import { VitePWA } from 'vite-plugin-pwa'
import legacy from '@vitejs/plugin-legacy'
import { copyFileSync, mkdirSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Plugin local: copia los iconos PWA y avatares al dist/
function copyPwaIcons() {
  return {
    name: 'copy-pwa-icons',
    closeBundle() {
      const src = resolve(__dirname, 'public')
      const dst = resolve(__dirname, 'dist')
      try { mkdirSync(dst, { recursive: true }) } catch {}

      // Copiar archivos PWA
      for (const f of ['pwa-512.png', 'pwa-192.png', 'apple-touch-icon.png']) {
        try { copyFileSync(`${src}/${f}`, `${dst}/${f}`) } catch {}
      }

      // Páginas sueltas: no son parte de la PWA (no importan nada de js/ ni
      // css/, todo va inline) y Vite, con publicDir:false, solo procesa el
      // index.html. Sin esta copia quedan fuera del dist y en producción
      // devuelven 404, porque el servidor sirve dist/ cuando existe.
      for (const f of readdirSync(src)) {
        if (!f.endsWith('.html') || f === 'index.html') continue
        try { copyFileSync(`${src}/${f}`, `${dst}/${f}`) } catch {}
      }

      // Copiar imagenes propias (logo del Informe de Taller)
      const imgSrc = resolve(src, 'img')
      const imgDst = resolve(dst, 'img')
      try {
        mkdirSync(imgDst, { recursive: true })
        readdirSync(imgSrc).forEach(f => {
          try { copyFileSync(`${imgSrc}/${f}`, `${imgDst}/${f}`) } catch {}
        })
      } catch {}
      // Copiar carpeta de avatares
      const avatarsSrc = resolve(src, 'avatars')
      const avatarsDst = resolve(dst, 'avatars')
      try {
        mkdirSync(avatarsDst, { recursive: true })
        const files = readdirSync(avatarsSrc)
        files.forEach(f => {
          try { copyFileSync(`${avatarsSrc}/${f}`, `${avatarsDst}/${f}`) } catch {}
        })
      } catch {}
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  // No publicDir — our source lives in public/, which Vite must process
  publicDir: false,

  plugins: [
    legacy({
      targets: ['ios >= 12', 'safari >= 12'],
    }),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw-custom.js',
      registerType: 'autoUpdate',
      injectManifest: {
        // Las páginas sueltas (invitado, marcar, qr-tv, tv, despacho-admin)
        // no se abren nunca desde dentro de la PWA: cada una tiene su URL y
        // su público. Precachearlas engordaría la instalación de todos los
        // técnicos con páginas que no van a usar.
        globIgnores: ['**/{invitado,marcar,qr-tv,tv,despacho-admin}.html'],
      },
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
