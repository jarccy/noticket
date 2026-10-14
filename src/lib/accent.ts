// Accent color system. 'mono' = default black/white primary (pure CSS tokens).
// Presets carry a hand-tuned shade per theme; custom hex values get their
// dark-mode shade and readable foreground derived at runtime.

export interface AccentPreset {
  id: string
  label: string
  light: string
  dark: string
}

export const MONO_ACCENT = 'mono'

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'azul', label: 'Azul', light: '#2563eb', dark: '#60a5fa' },
  { id: 'esmeralda', label: 'Esmeralda', light: '#047857', dark: '#34d399' },
  { id: 'naranja', label: 'Naranja', light: '#c2410c', dark: '#fb923c' },
  { id: 'carmesi', label: 'Carmesí', light: '#dc2626', dark: '#f87171' },
  { id: 'rosa', label: 'Rosa', light: '#db2777', dark: '#f472b6' },
  { id: 'violeta', label: 'Violeta', light: '#7c3aed', dark: '#a78bfa' },
]

const HEX_RE = /^#([0-9a-f]{6})$/i

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value)
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function mix(hex: string, target: string, amount: number): string {
  const a = hexToRgb(hex)
  const b = hexToRgb(target)
  return rgbToHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as [number, number, number])
}

const NEAR_BLACK = '#18181b'
const NEAR_WHITE = '#fafafa'
const DARK_BG = '#0a0a0b'
const LIGHT_BG = '#fafafa'

/** Text color (near-black or near-white) with the better contrast on `bg`. */
export function readableOn(bg: string): string {
  return contrast(bg, NEAR_BLACK) >= contrast(bg, NEAR_WHITE) ? NEAR_BLACK : NEAR_WHITE
}

/** Nudge a color toward `target` until it reads (>= 4.5:1) against `surface`. */
function ensureContrast(hex: string, surface: string, target: string): string {
  let out = hex
  for (let step = 1; step <= 10 && contrast(out, surface) < 4.5; step++) {
    out = mix(hex, target, step * 0.08)
  }
  return out
}

export interface ResolvedAccent {
  light: string
  lightFg: string
  dark: string
  darkFg: string
}

/** Returns null for the monochrome default (CSS tokens handle it). */
export function resolveAccent(value: string): ResolvedAccent | null {
  const preset = ACCENT_PRESETS.find((p) => p.id === value)
  let light: string
  let dark: string

  if (preset) {
    light = preset.light
    dark = preset.dark
  } else if (isHexColor(value)) {
    light = ensureContrast(value.toLowerCase(), LIGHT_BG, '#000000')
    dark = ensureContrast(value.toLowerCase(), DARK_BG, '#ffffff')
  } else {
    return null
  }

  return { light, lightFg: readableOn(light), dark, darkFg: readableOn(dark) }
}

export function applyAccent(value: string) {
  const root = document.documentElement
  const resolved = resolveAccent(value)
  if (!resolved) {
    root.removeAttribute('data-accent')
    ;['--accent-light', '--accent-light-fg', '--accent-dark', '--accent-dark-fg'].forEach((v) =>
      root.style.removeProperty(v)
    )
    return
  }
  root.setAttribute('data-accent', value)
  root.style.setProperty('--accent-light', resolved.light)
  root.style.setProperty('--accent-light-fg', resolved.lightFg)
  root.style.setProperty('--accent-dark', resolved.dark)
  root.style.setProperty('--accent-dark-fg', resolved.darkFg)
}
