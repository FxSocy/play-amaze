import { useEffect, useState } from 'react'
import type { Palette } from '../../core/appearance'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function prefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

/** Tracks the OS light/dark setting, for the 'system' theme. */
export function usePrefersDark(): boolean {
  const [dark, setDark] = useState(prefersDark)
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const update = (): void => setDark(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return dark
}

/** Publishes a palette as CSS custom properties on :root: `textMuted` becomes `--text-muted`, `surface2` `--surface-2`. */
export function applyPalette(palette: Palette): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(palette)) {
    if (key === 'colorScheme') continue
    const name = key.replace(/[A-Z0-9]/g, (ch) => `-${ch.toLowerCase()}`)
    root.style.setProperty(`--${name}`, value)
  }
  root.style.colorScheme = palette.colorScheme
}
