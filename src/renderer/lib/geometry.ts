/** Punkt in einem beliebigen Koordinatensystem. */
export interface Point {
  x: number
  y: number
}

/** Achsenparalleles Rechteck. Ursprung oben-links, wenn nicht anders vermerkt. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 }

export function rectFromPoints(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

export function rectContains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const right = Math.max(a.x + a.width, b.x + b.width)
  const bottom = Math.max(a.y + a.height, b.y + b.height)
  return { x, y, width: right - x, height: bottom - y }
}

export function insetRect(r: Rect, dx: number, dy = dx): Rect {
  return { x: r.x + dx, y: r.y + dy, width: r.width - 2 * dx, height: r.height - 2 * dy }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

/** PDF-Koordinaten (Ursprung unten-links) → Overlay-Koordinaten (Ursprung oben-links). */
export function pdfRectToTopLeft(r: Rect, pageHeight: number): Rect {
  return { x: r.x, y: pageHeight - r.y - r.height, width: r.width, height: r.height }
}

/** Overlay-Koordinaten (oben-links) → PDF-Koordinaten (unten-links). */
export function topLeftRectToPdf(r: Rect, pageHeight: number): Rect {
  return { x: r.x, y: pageHeight - r.y - r.height, width: r.width, height: r.height }
}
