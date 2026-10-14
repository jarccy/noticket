import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { NotifyApp } from './components/notify/NotifyApp.tsx'
import { currentWindowLabel } from './lib/platform'

// One bundle, two Tauri windows: the main app and the notification popup.
const isNotifyWindow = currentWindowLabel() === 'notify'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isNotifyWindow ? <NotifyApp /> : <App />}
  </StrictMode>,
)
