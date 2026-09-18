import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Builds the site into `docs/`, which is what GitHub Pages serves for this
 * repo. `base: './'` keeps asset references relative so the site works from
 * the `/play-amaze/` subpath as well as from a domain root.
 */
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../docs',
    emptyOutDir: true,
    sourcemap: false
  }
})
