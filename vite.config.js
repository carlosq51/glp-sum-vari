import { defineConfig } from 'vite'
import autoprefixer from 'autoprefixer'

// https://vite.dev/config/
export default defineConfig({
  // No publicDir — our source lives in public/, which Vite must process
  publicDir: false,

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
