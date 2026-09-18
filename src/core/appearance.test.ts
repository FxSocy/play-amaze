import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APPEARANCE,
  DOT_COLOR_SWATCHES,
  DOT_SHAPE_IDS,
  MAZE_STYLE_IDS,
  resolvePalette,
  resolveTheme,
  sanitizeAppearance,
  THEME_IDS,
  THEMES
} from './appearance'

const COLOR = /^(#[0-9a-f]{6}|rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (0|1|0?\.\d+)\))$/i

describe('appearance', () => {
  it('offers the requested themes, styles and shapes', () => {
    expect(THEME_IDS).toEqual(expect.arrayContaining(['light', 'dark', 'tokyo-night', 'sage']))
    expect(THEME_IDS.length).toBeGreaterThanOrEqual(6)
    expect(MAZE_STYLE_IDS).toContain('retro')
    expect(MAZE_STYLE_IDS.length).toBeGreaterThanOrEqual(4)
    expect(DOT_SHAPE_IDS.length).toBeGreaterThanOrEqual(6)
  })

  it('defines every palette colour for every theme', () => {
    const keys = Object.keys(THEMES.light.palette).sort()
    for (const id of THEME_IDS) {
      const palette = THEMES[id].palette
      expect(Object.keys(palette).sort(), id).toEqual(keys)
      for (const [key, value] of Object.entries(palette)) {
        if (key === 'colorScheme') expect(['light', 'dark']).toContain(value)
        else expect(value, `${id}.${key}`).toMatch(COLOR)
      }
    }
  })

  it('falls back to defaults for invalid data', () => {
    expect(sanitizeAppearance(null)).toEqual(DEFAULT_APPEARANCE)
    expect(sanitizeAppearance({ theme: 'hotdog', mazeStyle: 3, dotShape: 'blob', dotColor: 'red' })).toEqual(
      DEFAULT_APPEARANCE
    )
  })

  it('keeps valid choices and normalises custom colours', () => {
    const appearance = {
      theme: 'tokyo-night',
      mazeStyle: 'retro',
      dotShape: 'star',
      dotColor: '#FFAA00',
      touchDpad: true,
      touchHintSeen: true
    }
    expect(sanitizeAppearance(appearance)).toEqual({ ...appearance, dotColor: '#ffaa00' })
    expect(sanitizeAppearance({ dotColor: '#fff' }).dotColor).toBeNull()
    // Touch preferences are booleans or nothing.
    expect(sanitizeAppearance({ touchDpad: 'yes' }).touchDpad).toBe(false)
    for (const swatch of DOT_COLOR_SWATCHES) expect(sanitizeAppearance({ dotColor: swatch }).dotColor).toBe(swatch)
  })

  it('resolves the system theme from the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('sage', true)).toBe('sage')
  })

  it('overrides only the player colour with a custom dot colour', () => {
    const base = resolvePalette({ ...DEFAULT_APPEARANCE, theme: 'ember' }, false)
    expect(base).toBe(THEMES.ember.palette)
    const custom = resolvePalette({ ...DEFAULT_APPEARANCE, theme: 'ember', dotColor: '#123456' }, false)
    expect(custom).toEqual({ ...THEMES.ember.palette, player: '#123456' })
  })
})
