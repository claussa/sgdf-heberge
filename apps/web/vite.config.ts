import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Même site SPA + API : en prod, Edge Services route /api vers le container (§9).
    // En dev, ce proxy joue le même rôle — le cookie SameSite=Lax reste first-party.
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
