import '@fontsource/caveat-brush'
import '@fontsource/raleway/400.css'
import '@fontsource/raleway/700.css'
import '@fontsource/sarabun/400.css'
import '@fontsource/sarabun/700.css'
import '@fontsource/sarabun/800.css'
import './styles/tokens.css'
import './styles/global.css'
import { eventConfig } from '@repo/event-config'
import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App'
import { assetUrl } from './lib/assets'
import { initAnalytics } from './lib/posthog'
import { queryClient } from './lib/query'

initAnalytics()

// Favicon nommé par la config événement — un <link> statique dans index.html
// ne peut pas référencer un asset fingerprinté par Vite.
const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/svg+xml'
favicon.href = assetUrl(eventConfig.assets.favicon)
document.head.appendChild(favicon)

const root = document.getElementById('root')
if (!root) throw new Error('#root introuvable')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
