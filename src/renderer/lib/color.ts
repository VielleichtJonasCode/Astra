export interface Rgb {
  r: number
  g: number
  b: number
}

/** "#rrggbb" oder "#rgb" → {r,g,b} im Bereich 0..1 (für pdf-lib). */
export function hexToRgb01(hex: string): Rgb {
  const c = hex.replace('#', '').trim()
  const full = c.length === 3 ? c.replace(/(.)/g, '$1$1') : c
  const n = parseInt(full, 16)
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255
  }
}

/** {r,g,b} 0..255 → "#rrggbb". */
export function rgb255ToHex({ r, g, b }: Rgb): string {
  const h = (v: number): string => Math.round(clamp255(v)).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function clamp255(v: number): number {
  return Math.min(255, Math.max(0, v))
}

/** Relative Luminanz – für Kontrast-Entscheidungen (Textfarbe auf Fläche). */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb01(hex)
  const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function readableTextColor(bgHex: string): string {
  return luminance(bgHex) > 0.45 ? '#000000' : '#ffffff'
}

export const SWATCHES: string[] = [
  '#1c1c1e',
  '#8e8e93',
  '#ffffff',
  '#ff453a',
  '#ff9f0a',
  '#ffd60a',
  '#30d158',
  '#0a84ff',
  '#5e5ce6',
  '#bf5af2',
  '#ff375f'
]
