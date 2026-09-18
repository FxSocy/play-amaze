/**
 * Per-device preferences: colour theme, maze drawing style, the player dot, and
 * how touch controls behave. None of these affect gameplay or best times.
 *
 * The touch options live here rather than in GameSettings because they are
 * properties of the device you are playing on, and they save the moment you
 * change them instead of waiting for "Save as default".
 */

export type ThemeId = 'light' | 'dark' | 'tokyo-night' | 'sage' | 'ember' | 'blossom' | 'terminal'
export type ThemeChoice = 'system' | ThemeId
export type MazeStyleId = 'classic' | 'retro' | 'neon' | 'blueprint' | 'sketch' | 'hedge'
export type DotShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'star' | 'heart' | 'hexagon' | 'ring'

export interface Appearance {
  theme: ThemeChoice
  mazeStyle: MazeStyleId
  dotShape: DotShape
  /** '#rrggbb', or null to use the theme's player colour. */
  dotColor: string | null
  /** Show the on-screen direction pad on touch devices. */
  touchDpad: boolean
  /** Set once the player has seen the touch controls explained, so it only shows once. */
  touchHintSeen: boolean
}

/** Colours for the app chrome and the canvas. Every theme defines all of them. */
export interface Palette {
  colorScheme: 'light' | 'dark'
  // Chrome
  bg: string
  surface: string
  surface2: string
  border: string
  text: string
  textMuted: string
  accent: string
  accentText: string
  success: string
  danger: string
  doozie: string
  // Canvas
  canvasBg: string
  fog: string
  floor: string
  floorSeen: string
  wall: string
  wallSeen: string
  player: string
  start: string
  exit: string
  hint: string
  route: string
  trail: string
  solution: string
}

export const THEMES: Record<ThemeId, { label: string; palette: Palette }> = {
  light: {
    label: 'Light',
    palette: {
      colorScheme: 'light',
      bg: '#f5f6f8',
      surface: '#ffffff',
      surface2: '#eef0f3',
      border: '#dde1e7',
      text: '#1c2027',
      textMuted: '#69717d',
      accent: '#3b6ef5',
      accentText: '#ffffff',
      success: '#1f9d61',
      danger: '#d93d42',
      doozie: '#e0561a',
      canvasBg: '#f5f6f8',
      fog: '#d9dde3',
      floor: '#ffffff',
      floorSeen: '#eceef2',
      wall: '#2a2f38',
      wallSeen: '#9aa1ab',
      player: '#3b6ef5',
      start: '#dde6fd',
      exit: '#2fbf7a',
      hint: '#f0a326',
      route: 'rgba(59, 110, 245, 0.35)',
      trail: 'rgba(139, 92, 246, 0.35)',
      solution: '#e5484d'
    }
  },
  dark: {
    label: 'Dark',
    palette: {
      colorScheme: 'dark',
      bg: '#15171c',
      surface: '#1d2027',
      surface2: '#262a33',
      border: '#323743',
      text: '#e6e8ec',
      textMuted: '#8b93a1',
      accent: '#6d95ff',
      accentText: '#0d1322',
      success: '#43cf8b',
      danger: '#e5484d',
      doozie: '#f06a2b',
      canvasBg: '#15171c',
      fog: '#0f1115',
      floor: '#1f232b',
      floorSeen: '#191c22',
      wall: '#d3d7de',
      wallSeen: '#5a616d',
      player: '#6d95ff',
      start: '#28324a',
      exit: '#35c47f',
      hint: '#f5b544',
      route: 'rgba(109, 149, 255, 0.4)',
      trail: 'rgba(167, 139, 250, 0.4)',
      solution: '#ff6b6f'
    }
  },
  'tokyo-night': {
    label: 'Tokyo Night',
    palette: {
      colorScheme: 'dark',
      bg: '#1a1b26',
      surface: '#1f2335',
      surface2: '#292e42',
      border: '#3b4261',
      text: '#c0caf5',
      textMuted: '#737aa2',
      accent: '#7aa2f7',
      accentText: '#1a1b26',
      success: '#9ece6a',
      danger: '#f7768e',
      doozie: '#ff9e64',
      canvasBg: '#16161e',
      fog: '#101018',
      floor: '#222436',
      floorSeen: '#1b1d2b',
      wall: '#82aaff',
      wallSeen: '#444b6a',
      player: '#ff007c',
      start: '#2f334d',
      exit: '#9ece6a',
      hint: '#e0af68',
      route: 'rgba(122, 162, 247, 0.4)',
      trail: 'rgba(187, 154, 247, 0.4)',
      solution: '#f7768e'
    }
  },
  sage: {
    label: 'Sage',
    palette: {
      colorScheme: 'light',
      bg: '#eef1ea',
      surface: '#f8faf5',
      surface2: '#e3e9dc',
      border: '#cdd6c3',
      text: '#2f3a2c',
      textMuted: '#6b7765',
      accent: '#5f8b5a',
      accentText: '#ffffff',
      success: '#4f8a4b',
      danger: '#c2564b',
      doozie: '#c7743a',
      canvasBg: '#eef1ea',
      fog: '#d5dccd',
      floor: '#fbfcf8',
      floorSeen: '#e8ede2',
      wall: '#3d4a38',
      wallSeen: '#9aa592',
      player: '#a8573a',
      start: '#dfe9d6',
      exit: '#5f9e55',
      hint: '#d4a23f',
      route: 'rgba(95, 139, 90, 0.35)',
      trail: 'rgba(168, 87, 58, 0.3)',
      solution: '#c2564b'
    }
  },
  ember: {
    label: 'Ember',
    palette: {
      colorScheme: 'dark',
      bg: '#1c1512',
      surface: '#241b17',
      surface2: '#2f241f',
      border: '#43342c',
      text: '#f1e3d6',
      textMuted: '#a8927f',
      accent: '#ff8a4c',
      accentText: '#1c1512',
      success: '#9bc46b',
      danger: '#ff5c5c',
      doozie: '#ffb347',
      canvasBg: '#1c1512',
      fog: '#140f0c',
      floor: '#2a201b',
      floorSeen: '#221a16',
      wall: '#f0c9a4',
      wallSeen: '#6d5646',
      player: '#ff8a4c',
      start: '#3a2b22',
      exit: '#9bc46b',
      hint: '#ffd166',
      route: 'rgba(255, 138, 76, 0.4)',
      trail: 'rgba(255, 179, 71, 0.35)',
      solution: '#ff5c5c'
    }
  },
  blossom: {
    label: 'Blossom',
    palette: {
      colorScheme: 'light',
      bg: '#fbf1f4',
      surface: '#fffafb',
      surface2: '#f5e4ea',
      border: '#ebcfd9',
      text: '#3b2530',
      textMuted: '#8a6874',
      accent: '#d6588a',
      accentText: '#ffffff',
      success: '#3f9e76',
      danger: '#d0444f',
      doozie: '#e46a2e',
      canvasBg: '#fbf1f4',
      fog: '#efd9e1',
      floor: '#fffafb',
      floorSeen: '#f7e8ee',
      wall: '#5a2f43',
      wallSeen: '#c09aab',
      player: '#d6588a',
      start: '#f6dbe6',
      exit: '#3fae80',
      hint: '#f0a326',
      route: 'rgba(214, 88, 138, 0.35)',
      trail: 'rgba(145, 100, 200, 0.3)',
      solution: '#d0444f'
    }
  },
  terminal: {
    label: 'Terminal',
    palette: {
      colorScheme: 'dark',
      bg: '#0a0f0a',
      surface: '#0f1a10',
      surface2: '#142417',
      border: '#1f3b24',
      text: '#9dffa8',
      textMuted: '#4f9a5a',
      accent: '#39ff6a',
      accentText: '#031405',
      success: '#39ff6a',
      danger: '#ff5f56',
      doozie: '#ffb000',
      canvasBg: '#050805',
      fog: '#030503',
      floor: '#0a120b',
      floorSeen: '#07100a',
      wall: '#39ff6a',
      wallSeen: '#1f6b30',
      player: '#ffb000',
      start: '#123a1b',
      exit: '#39c0ff',
      hint: '#ffb000',
      route: 'rgba(57, 255, 106, 0.35)',
      trail: 'rgba(255, 176, 0, 0.35)',
      solution: '#ff5f56'
    }
  }
}
export const THEME_IDS = Object.keys(THEMES) as ThemeId[]
export const THEME_CHOICES: ThemeChoice[] = ['system', ...THEME_IDS]

export const MAZE_STYLES: Record<MazeStyleId, { label: string; description: string }> = {
  classic: { label: 'Classic', description: 'Clean, crisp lines.' },
  retro: { label: 'Retro', description: 'Chunky pixel walls with CRT scanlines.' },
  neon: { label: 'Neon', description: 'Glowing tubes on a dark floor.' },
  blueprint: { label: 'Blueprint', description: 'Fine drafting lines over grid paper.' },
  sketch: { label: 'Sketch', description: 'Hand-drawn pencil strokes.' },
  hedge: { label: 'Hedge', description: 'Thick, rounded garden hedges.' }
}
export const MAZE_STYLE_IDS = Object.keys(MAZE_STYLES) as MazeStyleId[]

export const DOT_SHAPES: Record<DotShape, { label: string }> = {
  circle: { label: 'Circle' },
  square: { label: 'Square' },
  diamond: { label: 'Diamond' },
  triangle: { label: 'Triangle' },
  star: { label: 'Star' },
  heart: { label: 'Heart' },
  hexagon: { label: 'Hexagon' },
  ring: { label: 'Ring' }
}
export const DOT_SHAPE_IDS = Object.keys(DOT_SHAPES) as DotShape[]

/** Quick picks offered alongside a free colour picker. */
export const DOT_COLOR_SWATCHES = [
  '#3b6ef5',
  '#14b8a6',
  '#2fbf7a',
  '#f0a326',
  '#f97316',
  '#e5484d',
  '#ec4899',
  '#a855f7',
  '#111827',
  '#ffffff'
]

export const DEFAULT_APPEARANCE: Readonly<Appearance> = {
  theme: 'system',
  mazeStyle: 'classic',
  dotShape: 'circle',
  dotColor: null,
  touchDpad: false,
  touchHintSeen: false
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** Coerces untrusted data (saved JSON, IPC payloads) into a valid appearance. */
export function sanitizeAppearance(raw: unknown): Appearance {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_APPEARANCE
  return {
    theme: oneOf(src.theme, THEME_CHOICES, d.theme),
    mazeStyle: oneOf(src.mazeStyle, MAZE_STYLE_IDS, d.mazeStyle),
    dotShape: oneOf(src.dotShape, DOT_SHAPE_IDS, d.dotShape),
    dotColor: typeof src.dotColor === 'string' && HEX_COLOR.test(src.dotColor) ? src.dotColor.toLowerCase() : null,
    touchDpad: typeof src.touchDpad === 'boolean' ? src.touchDpad : d.touchDpad,
    touchHintSeen: typeof src.touchHintSeen === 'boolean' ? src.touchHintSeen : d.touchHintSeen
  }
}

/** The concrete theme for a choice; 'system' follows the OS light/dark setting. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ThemeId {
  if (choice !== 'system') return choice
  return prefersDark ? 'dark' : 'light'
}

/** The palette to render with, including the player's custom dot colour. */
export function resolvePalette(appearance: Appearance, prefersDark: boolean): Palette {
  const palette = THEMES[resolveTheme(appearance.theme, prefersDark)].palette
  return appearance.dotColor ? { ...palette, player: appearance.dotColor } : palette
}
