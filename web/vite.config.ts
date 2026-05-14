import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'spa-fallback',
      configureServer(server) {
        const handler = (_req: any, _res: any, next: any) => {
          const url = _req.url || '/'
          if (
            _req.method === 'GET' &&
            !url.startsWith('/api') &&
            !url.startsWith('/@') &&
            !url.startsWith('/node_modules') &&
            !url.startsWith('/src') &&
            !url.includes('.')
          ) {
            _req.url = '/index.html'
          }
          next()
        }
        (server.middlewares as any).stack.unshift({ route: '', handle: handler })
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3031,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:1031',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
