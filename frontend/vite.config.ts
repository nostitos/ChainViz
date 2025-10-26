import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/react'],
    exclude: [],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
  define: {
    // Use relative URLs in production to avoid CORS issues
    // Nginx will proxy /api to the backend container
    'import.meta.env.VITE_API_BASE_URL': mode === 'production' 
      ? JSON.stringify('/api')
      : JSON.stringify('http://localhost:8000/api'),
  },
}))


