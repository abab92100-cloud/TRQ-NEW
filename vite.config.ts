import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'development' ? [inspectAttr()] : [])],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/kucoin': {
        target: 'https://api-futures.kucoin.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/kucoin/, ''),
      },
    },
  },
  preview: {
    proxy: {
      '/kucoin': {
        target: 'https://api-futures.kucoin.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/kucoin/, ''),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
