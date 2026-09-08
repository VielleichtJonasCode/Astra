import { nanoid } from 'nanoid'

export type ImgTool =
  | 'select'
  | 'crop'
  | 'text'
  | 'redact'
  | 'pixelate'
  | 'blur'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'draw'
  | 'highlight'
  | 'step'

export interface AnnoBase {
  id: string
}

export interface BoxAnno extends AnnoBase {
  type: 'redact' | 'pixelate' | 'blur' | 'rect' | 'ellipse' | 'highlight'
  x: number
  y: number
  w: number
  h: number
  color: string
  fill: boolean
  strokeWidth: number
  /** Blockgröße (verpixeln) bzw. Radius (weichzeichnen) in Bild-Pixeln. */
  strength: number
}

export interface LineAnno extends AnnoBase {
  type: 'line' | 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  strokeWidth: number
}

export interface TextAnno extends AnnoBase {
  type: 'text'
  x: number
  y: number
  w: number
  text: string
  fontSize: number
  color: string
  bg: string | null
  align: 'left' | 'center' | 'right'
  bold: boolean
}

export interface DrawAnno extends AnnoBase {
  type: 'draw'
  /** Flache Punktliste [x0,y0,x1,y1,…] in Bild-Pixeln. */
  points: number[]
  color: string
  strokeWidth: number
}

export interface StepAnno extends AnnoBase {
  type: 'step'
  /** Mittelpunkt. */
  x: number
  y: number
  n: number
  color: string
}

export type Anno = BoxAnno | LineAnno | TextAnno | DrawAnno | StepAnno

export interface Adjust {
  brightness: number
  contrast: number
  saturate: number
  grayscale: number
  sepia: number
  invert: number
  hue: number
  blur: number
}

export const NEUTRAL_ADJUST: Adjust = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  grayscale: 0,
  sepia: 0,
  invert: 0,
  hue: 0,
  blur: 0
}

export function filterString(a: Adjust): string {
  const p: string[] = []
  if (a.brightness !== 100) p.push(`brightness(${a.brightness}%)`)
  if (a.contrast !== 100) p.push(`contrast(${a.contrast}%)`)
  if (a.saturate !== 100) p.push(`saturate(${a.saturate}%)`)
  if (a.grayscale) p.push(`grayscale(${a.grayscale}%)`)
  if (a.sepia) p.push(`sepia(${a.sepia}%)`)
  if (a.invert) p.push(`invert(${a.invert}%)`)
  if (a.hue) p.push(`hue-rotate(${a.hue}deg)`)
  if (a.blur) p.push(`blur(${a.blur}px)`)
  return p.length ? p.join(' ') : 'none'
}

export function isNeutralAdjust(a: Adjust): boolean {
  return filterString(a) === 'none'
}

export const ADJUST_PRESETS: { id: string; label: string; patch: Partial<Adjust> }[] = [
  { id: 'none', label: 'Original', patch: { ...NEUTRAL_ADJUST } },
  { id: 'mono', label: 'S/W', patch: { grayscale: 100, contrast: 108 } },
  { id: 'sepia', label: 'Sepia', patch: { sepia: 65, saturate: 115, brightness: 104 } },
  { id: 'pop', label: 'Kräftig', patch: { saturate: 150, contrast: 115 } },
  { id: 'cool', label: 'Kühl', patch: { hue: -12, saturate: 108 } },
  { id: 'warm', label: 'Warm', patch: { hue: 12, sepia: 18, brightness: 103 } },
  { id: 'invert', label: 'Negativ', patch: { invert: 100 } }
]

/* ---------- Farb-Kontext für neue Annotationen ---------- */

export interface ToolCtx {
  color: string
  strokeWidth: number
  fontSize: number
  strength: number
}

/** Legt aus einem aufgezogenen Rechteck eine Annotation an. */
export function makeBoxAnno(
  type: BoxAnno['type'],
  x: number,
  y: number,
  w: number,
  h: number,
  ctx: ToolCtx
): BoxAnno {
  return {
    id: nanoid(10),
    type,
    x,
    y,
    w,
    h,
    color: type === 'redact' ? '#000000' : ctx.color,
    fill: type === 'redact' || type === 'highlight',
    strokeWidth: ctx.strokeWidth,
    strength: type === 'pixelate' || type === 'blur' ? ctx.strength : 0
  }
}

export function makeLineAnno(
  type: 'line' | 'arrow',
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ctx: ToolCtx
): LineAnno {
  return { id: nanoid(10), type, x1, y1, x2, y2, color: ctx.color, strokeWidth: ctx.strokeWidth }
}

export function makeTextAnno(x: number, y: number, w: number, ctx: ToolCtx): TextAnno {
  return {
    id: nanoid(10),
    type: 'text',
    x,
    y,
    w,
    text: '',
    fontSize: ctx.fontSize,
    color: ctx.color,
    bg: null,
    align: 'left',
    bold: false
  }
}

export function makeDrawAnno(points: number[], ctx: ToolCtx): DrawAnno {
  return { id: nanoid(10), type: 'draw', points, color: ctx.color, strokeWidth: ctx.strokeWidth }
}

export function makeStepAnno(x: number, y: number, n: number, ctx: ToolCtx): StepAnno {
  return { id: nanoid(10), type: 'step', x, y, n, color: ctx.color }
}

/** Umschließendes Rechteck einer Annotation (für Auswahl/Treffertest). */
export function annoBounds(a: Anno): { x: number; y: number; w: number; h: number } {
  switch (a.type) {
    case 'line':
    case 'arrow':
      return {
        x: Math.min(a.x1, a.x2),
        y: Math.min(a.y1, a.y2),
        w: Math.abs(a.x1 - a.x2),
        h: Math.abs(a.y1 - a.y2)
      }
    case 'text':
      return { x: a.x, y: a.y, w: a.w, h: Math.max(a.fontSize * 1.4, 20) }
    case 'draw': {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (let i = 0; i < a.points.length; i += 2) {
        minX = Math.min(minX, a.points[i])
        maxX = Math.max(maxX, a.points[i])
        minY = Math.min(minY, a.points[i + 1])
        maxY = Math.max(maxY, a.points[i + 1])
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    }
    case 'step': {
      const r = 17 // = STEP_RADIUS in compose.ts
      return { x: a.x - r, y: a.y - r, w: r * 2, h: r * 2 }
    }
    default:
      return { x: a.x, y: a.y, w: a.w, h: a.h }
  }
}
