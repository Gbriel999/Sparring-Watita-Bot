import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The built panel is served by bot.js; in development the API goes to the running bot
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:3210' }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
