import type { Point, Rect } from '../lib/geometry'
import { unionRect } from '../lib/geometry'
import type { TextItemBox } from './pdfjs'

interface Placed extends TextItemBox {
  line: number
  order: number
}

function toReadingOrder(boxes: TextItemBox[]): Placed[] {
  const sorted = [...boxes]
    .filter((b) => b.str.trim().length > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x)
  const placed: Placed[] = []
  let line = 0
  let lastY = Number.NaN
  for (const b of sorted) {
    if (!Number.isNaN(lastY) && Math.abs(b.y - lastY) > Math.max(3, b.fontHeight * 0.6)) line++
    lastY = b.y
    placed.push({ ...b, line, order: placed.length })
  }
  // innerhalb einer Zeile nach x sortieren
  placed.sort((a, b) => a.line - b.line || a.x - b.x)
  placed.forEach((p, i) => (p.order = i))
  return placed
}

function nearestIndex(placed: Placed[], pt: Point): number {
  let best = 0
  let bestD = Infinity
  for (const p of placed) {
    const cx = p.x + p.width / 2
    const cy = p.y + p.height / 2
    // Zeilen stärker gewichten als Spalten
    const d = Math.abs(cy - pt.y) * 3 + Math.abs(cx - pt.x)
    if (d < bestD) {
      bestD = d
      best = p.order
    }
  }
  return best
}

/**
 * Wandelt eine Ziehgeste (a→b) in Text-Markierungs-Rechtecke (ein Quad je Zeile)
 * um – wie eine Textauswahl. Leeres Ergebnis, wenn kein Text getroffen wurde.
 */
export function selectTextQuads(boxes: TextItemBox[], a: Point, b: Point): Rect[] {
  if (boxes.length === 0) return []
  const placed = toReadingOrder(boxes)
  if (placed.length === 0) return []

  let i0 = nearestIndex(placed, a)
  let i1 = nearestIndex(placed, b)
  if (i0 > i1) [i0, i1] = [i1, i0]

  const run = placed.slice(i0, i1 + 1)
  const byLine = new Map<number, Rect>()
  for (const p of run) {
    const r: Rect = { x: p.x, y: p.y, width: p.width, height: p.height }
    const cur = byLine.get(p.line)
    byLine.set(p.line, cur ? unionRect(cur, r) : r)
  }
  return [...byLine.values()].sort((r1, r2) => r1.y - r2.y)
}
