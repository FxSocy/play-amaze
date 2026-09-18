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
  // Mobile browsers tint their chrome (and the status bar of an installed app)
  // with this, so it tracks the theme rather than the value baked into the HTML.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.surface)
}

const COARSE_QUERY = '(pointer: coarse)'
/**
 * The phone layout breakpoint, matching styles.css — keep the two in step.
 * Height counts as well as width: a phone in landscape is wide but has no room
 * to spend on a header that wraps onto three rows.
 */
const NARROW_QUERY = '(max-width: 720px), (max-height: 480px)'

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = (): void => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

/** True on a phone-width screen, where the header collapses to a compact bar. */
export function useIsNarrow(): boolean {
  return useMediaQuery(NARROW_QUERY)
}

/** True on devices whose primary input is touch, used to pick touch-appropriate UI. */
export function useIsTouch(): boolean {
  return useMediaQuery(COARSE_QUERY)
}
