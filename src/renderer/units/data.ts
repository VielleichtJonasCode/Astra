/** Einheiten-Daten und Umrechnung für den Umrechner. Rein lokal. */

export interface Unit {
  id: string
  label: string
  /** Faktor zur SI-Basiseinheit der Kategorie (Basiswert = wert * factor). */
  factor?: number
  /** Sonderfall (Temperatur): Umrechnung in/aus Basis. */
  toBase?: (v: number) => number
  fromBase?: (v: number) => number
}

export interface UnitCategory {
  id: string
  label: string
  base: string
  units: Unit[]
}

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: 'length',
    label: 'Länge',
    base: 'm',
    units: [
      { id: 'nm', label: 'Nanometer', factor: 1e-9 },
      { id: 'um', label: 'Mikrometer', factor: 1e-6 },
      { id: 'mm', label: 'Millimeter', factor: 1e-3 },
      { id: 'cm', label: 'Zentimeter', factor: 1e-2 },
      { id: 'm', label: 'Meter', factor: 1 },
      { id: 'km', label: 'Kilometer', factor: 1000 },
      { id: 'in', label: 'Zoll (in)', factor: 0.0254 },
      { id: 'ft', label: 'Fuß (ft)', factor: 0.3048 },
      { id: 'yd', label: 'Yard', factor: 0.9144 },
      { id: 'mi', label: 'Meile', factor: 1609.344 },
      { id: 'nmi', label: 'Seemeile', factor: 1852 }
    ]
  },
  {
    id: 'area',
    label: 'Fläche',
    base: 'm²',
    units: [
      { id: 'mm2', label: 'mm²', factor: 1e-6 },
      { id: 'cm2', label: 'cm²', factor: 1e-4 },
      { id: 'm2', label: 'm²', factor: 1 },
      { id: 'ha', label: 'Hektar', factor: 10000 },
      { id: 'km2', label: 'km²', factor: 1e6 },
      { id: 'in2', label: 'Zoll²', factor: 0.00064516 },
      { id: 'ft2', label: 'Fuß²', factor: 0.09290304 },
      { id: 'ac', label: 'Acre', factor: 4046.8564224 }
    ]
  },
  {
    id: 'volume',
    label: 'Volumen',
    base: 'l',
    units: [
      { id: 'ml', label: 'Milliliter', factor: 0.001 },
      { id: 'cl', label: 'Zentiliter', factor: 0.01 },
      { id: 'l', label: 'Liter', factor: 1 },
      { id: 'm3', label: 'Kubikmeter', factor: 1000 },
      { id: 'tsp', label: 'Teelöffel', factor: 0.00492892 },
      { id: 'tbsp', label: 'Esslöffel', factor: 0.0147868 },
      { id: 'cup', label: 'Cup (US)', factor: 0.236588 },
      { id: 'flozus', label: 'fl oz (US)', factor: 0.0295735 },
      { id: 'pint', label: 'Pint (US)', factor: 0.473176 },
      { id: 'galus', label: 'Gallone (US)', factor: 3.78541 },
      { id: 'galuk', label: 'Gallone (UK)', factor: 4.54609 }
    ]
  },
  {
    id: 'mass',
    label: 'Masse',
    base: 'kg',
    units: [
      { id: 'mg', label: 'Milligramm', factor: 1e-6 },
      { id: 'g', label: 'Gramm', factor: 1e-3 },
      { id: 'kg', label: 'Kilogramm', factor: 1 },
      { id: 't', label: 'Tonne', factor: 1000 },
      { id: 'oz', label: 'Unze (oz)', factor: 0.028349523125 },
      { id: 'lb', label: 'Pfund (lb)', factor: 0.45359237 },
      { id: 'st', label: 'Stone', factor: 6.35029318 },
      { id: 'ct', label: 'Karat', factor: 0.0002 }
    ]
  },
  {
    id: 'temp',
    label: 'Temperatur',
    base: 'K',
    units: [
      { id: 'c', label: 'Celsius (°C)', toBase: (v) => v + 273.15, fromBase: (v) => v - 273.15 },
      {
        id: 'f',
        label: 'Fahrenheit (°F)',
        toBase: (v) => (v - 32) / 1.8 + 273.15,
        fromBase: (v) => (v - 273.15) * 1.8 + 32
      },
      { id: 'k', label: 'Kelvin (K)', toBase: (v) => v, fromBase: (v) => v },
      {
        id: 'r',
        label: 'Rankine (°Ra)',
        toBase: (v) => v / 1.8,
        fromBase: (v) => v * 1.8
      }
    ]
  },
  {
    id: 'speed',
    label: 'Geschwindigkeit',
    base: 'm/s',
    units: [
      { id: 'ms', label: 'm/s', factor: 1 },
      { id: 'kmh', label: 'km/h', factor: 1 / 3.6 },
      { id: 'mph', label: 'mph', factor: 0.44704 },
      { id: 'kn', label: 'Knoten', factor: 0.514444 },
      { id: 'fts', label: 'ft/s', factor: 0.3048 },
      { id: 'mach', label: 'Mach (Luft)', factor: 340.29 }
    ]
  },
  {
    id: 'time',
    label: 'Zeit',
    base: 's',
    units: [
      { id: 'ms', label: 'Millisekunden', factor: 0.001 },
      { id: 's', label: 'Sekunden', factor: 1 },
      { id: 'min', label: 'Minuten', factor: 60 },
      { id: 'h', label: 'Stunden', factor: 3600 },
      { id: 'd', label: 'Tage', factor: 86400 },
      { id: 'wk', label: 'Wochen', factor: 604800 },
      { id: 'mo', label: 'Monate (30 T.)', factor: 2592000 },
      { id: 'yr', label: 'Jahre (365 T.)', factor: 31536000 }
    ]
  },
  {
    id: 'data',
    label: 'Datenmenge',
    base: 'Byte',
    units: [
      { id: 'bit', label: 'Bit', factor: 0.125 },
      { id: 'B', label: 'Byte', factor: 1 },
      { id: 'KB', label: 'Kilobyte (1000)', factor: 1e3 },
      { id: 'MB', label: 'Megabyte (1000)', factor: 1e6 },
      { id: 'GB', label: 'Gigabyte (1000)', factor: 1e9 },
      { id: 'TB', label: 'Terabyte (1000)', factor: 1e12 },
      { id: 'KiB', label: 'Kibibyte (1024)', factor: 1024 },
      { id: 'MiB', label: 'Mebibyte (1024)', factor: 1024 ** 2 },
      { id: 'GiB', label: 'Gibibyte (1024)', factor: 1024 ** 3 },
      { id: 'TiB', label: 'Tebibyte (1024)', factor: 1024 ** 4 }
    ]
  },
  {
    id: 'pressure',
    label: 'Druck',
    base: 'Pa',
    units: [
      { id: 'pa', label: 'Pascal', factor: 1 },
      { id: 'hpa', label: 'Hektopascal', factor: 100 },
      { id: 'kpa', label: 'Kilopascal', factor: 1000 },
      { id: 'bar', label: 'Bar', factor: 1e5 },
      { id: 'atm', label: 'Atmosphäre', factor: 101325 },
      { id: 'psi', label: 'psi', factor: 6894.757 },
      { id: 'mmhg', label: 'mmHg / Torr', factor: 133.322 }
    ]
  },
  {
    id: 'energy',
    label: 'Energie',
    base: 'J',
    units: [
      { id: 'j', label: 'Joule', factor: 1 },
      { id: 'kj', label: 'Kilojoule', factor: 1000 },
      { id: 'cal', label: 'Kalorie', factor: 4.184 },
      { id: 'kcal', label: 'Kilokalorie', factor: 4184 },
      { id: 'wh', label: 'Wattstunde', factor: 3600 },
      { id: 'kwh', label: 'Kilowattstunde', factor: 3.6e6 },
      { id: 'ev', label: 'Elektronenvolt', factor: 1.602176634e-19 },
      { id: 'btu', label: 'BTU', factor: 1055.06 }
    ]
  },
  {
    id: 'power',
    label: 'Leistung',
    base: 'W',
    units: [
      { id: 'w', label: 'Watt', factor: 1 },
      { id: 'kw', label: 'Kilowatt', factor: 1000 },
      { id: 'mw', label: 'Megawatt', factor: 1e6 },
      { id: 'hp', label: 'PS (metrisch)', factor: 735.49875 },
      { id: 'hpi', label: 'HP (imperial)', factor: 745.7 },
      { id: 'btuh', label: 'BTU/h', factor: 0.293071 }
    ]
  },
  {
    id: 'angle',
    label: 'Winkel',
    base: 'rad',
    units: [
      { id: 'deg', label: 'Grad (°)', factor: Math.PI / 180 },
      { id: 'rad', label: 'Radiant', factor: 1 },
      { id: 'grad', label: 'Gon / Neugrad', factor: Math.PI / 200 },
      { id: 'turn', label: 'Umdrehungen', factor: 2 * Math.PI },
      { id: 'arcmin', label: 'Bogenminuten', factor: Math.PI / 10800 },
      { id: 'arcsec', label: 'Bogensekunden', factor: Math.PI / 648000 }
    ]
  }
]

export function convertWithin(
  cat: UnitCategory,
  value: number,
  fromId: string
): Record<string, number> {
  const from = cat.units.find((u) => u.id === fromId)
  if (!from) return {}
  const baseVal = from.toBase ? from.toBase(value) : value * (from.factor ?? 1)
  const out: Record<string, number> = {}
  for (const u of cat.units) {
    out[u.id] = u.fromBase ? u.fromBase(baseVal) : baseVal / (u.factor ?? 1)
  }
  return out
}

/** Anzeige-Formatierung: kompakt, aber ohne Genauigkeitsverlust im Alltag. */
export function fmtNumber(n: number): string {
  if (!isFinite(n)) return '–'
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e15 || abs < 1e-6) return n.toExponential(6).replace(/\.?0+e/, 'e')
  const digits = abs >= 1 ? Math.max(0, 8 - Math.floor(Math.log10(abs))) : 8
  return parseFloat(n.toFixed(Math.min(12, digits))).toLocaleString('de-DE', {
    maximumFractionDigits: 12,
    useGrouping: abs >= 10000
  })
}

/* ---------- Zahlensysteme ---------- */

export function parseInBase(str: string, base: number): number | null {
  const t = str
    .trim()
    .toLowerCase()
    .replace(/^0[bxo]/, '')
  if (t === '') return null
  const re =
    base === 2 ? /^[01]+$/ : base === 8 ? /^[0-7]+$/ : base === 16 ? /^[0-9a-f]+$/ : /^-?\d+$/
  if (!re.test(t)) return null
  const n = base === 10 ? parseInt(t, 10) : parseInt(t, base)
  return Number.isNaN(n) ? null : n
}

/* ---------- Farbe ---------- */

export interface Rgb {
  r: number
  g: number
  b: number
}
export interface Hsl {
  h: number
  s: number
  l: number
}

export function hexToRgb(hex: string): Rgb | null {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  }
}
export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}
export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6
    else if (max === gg) h = (bb - rr) / d + 2
    else h = (rr - gg) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}
export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const ss = s / 100
  const ll = l / 100
  const c = (1 - Math.abs(2 * ll - 1)) * ss
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ll - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  }
}
