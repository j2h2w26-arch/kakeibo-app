import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { createPwaUpdater } from './lib/pwaUpdater'

const updater = createPwaUpdater({
  serviceWorker: import.meta.env.PROD ? navigator.serviceWorker : undefined,
  isOnline: () => navigator.onLine,
  reload: () => window.location.reload(),
  events: window,
  page: document,
})
updater.start()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App updater={updater} />
  </StrictMode>,
)
