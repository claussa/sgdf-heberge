import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Ports surchargeables par env pour faire coexister plusieurs checkouts/worktrees
// (ex. VITE_PORT=5273 VITE_API_PROXY=http://127.0.0.1:3101).
const port = Number(process.env.VITE_PORT ?? 5173)
const apiProxy = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    port,
    // Même site SPA + API : en prod, Edge Services route /api vers le container (§9).
    // En dev, ce proxy joue le même rôle — le cookie SameSite=Lax reste first-party.
    proxy: {
      '/api': apiProxy,
    },
  },
})
