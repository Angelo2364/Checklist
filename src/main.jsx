import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname)) {
  document.title = 'Crysalis · Teste local'
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
