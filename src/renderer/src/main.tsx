import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_APPEARANCE, resolvePalette } from '../../core/appearance'
import { App } from './App'
import './styles.css'
import { applyPalette, prefersDark } from './theme'

// Paint with the default theme until saved preferences load.
applyPalette(resolvePalette(DEFAULT_APPEARANCE, prefersDark()))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
