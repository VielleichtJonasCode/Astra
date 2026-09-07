import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Rect } from '../lib/geometry'
import type { Rotation } from './model'
import { getCachedPage } from './pageCache'
import { rotateRectInPage } from './searchPdf'

export interface TextBlock {
  text: string
  /** Overlay-Koordinaten (oben-links), PDF-Punkte, im Anzeigeraum der Seite. */
  rect: Rect
  fontSize: number
  fontName: string
}

const cache = new WeakMap<PDFDocumentProxy, Map<number, TextBlock[]>>()

/** Gruppiert die Textstücke einer Seite zeilenweise zu bearbeitbaren Blöcken. */
export async function getTextBlocks(
  proxy: PDFDocumentProxy,
  pdfPageNumber: number,
  rotation: Rotation
): Promise<TextBlock[]> {
  let map = cache.get(proxy)
  if (!map) {
    map = new Map()
    cache.set(proxy, map)
  }
  const hit = map.get(pdfPageNumber)
  if (hit) return hit

  const page = await getCachedPage(proxy, pdfPageNumber)
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()

  interface Item {
    str: string
    x: number
    y: number
    w: number
    h: number
    fontName: string
  }
  const items: Item[] = []
  for (const it of content.items) {
    if (!('str' in it) || !it.str.trim()) continue
    const t = it.transform as number[]
    const fh = Math.hypot(t[2], t[3]) || it.height || 10
    items.push({
      str: it.str,
      x: t[4],
      y: viewport.height - t[5] - fh,
      w: it.width || fh * 0.5 * it.str.length,
      h: fh,
      fontName: (it as { fontName?: string }).fontName ?? ''
    })
  }

  // Zeilen bilden: nach y sortieren, benachbarte gleiche y zusammenfassen
  items.sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: Item[][] = []
  for (const it of items) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last[0].y - it.y) <= Math.max(2, it.h * 0.4)) {
      last.push(it)
    } else {
      lines.push([it])
    }
  }

  const blocks: TextBlock[] = lines.map((line) => {
    line.sort((a, b) => a.x - b.x)
    const x = Math.min(...line.map((i) => i.x))
    const y = Math.min(...line.map((i) => i.y))
    const right = Math.max(...line.map((i) => i.x + i.w))
    const bottom = Math.max(...line.map((i) => i.y + i.h))
    const rawRect: Rect = { x, y, width: right - x, height: bottom - y }
    const rect =
      rotation === 0
        ? rawRect
        : rotateRectInPage(rawRect, rotation, viewport.width, viewport.height)
    return {
      text: line.map((i) => i.str).join('').replace(/\s+/g, ' ').trim(),
      rect,
      fontSize: Math.round(line[0].h * 10) / 10,
      fontName: line[0].fontName
    }
  })

  map.set(pdfPageNumber, blocks)
  return blocks
}

/** Findet den Textblock unter einem Punkt (Overlay-Koordinaten). */
export function blockAtPoint(blocks: TextBlock[], x: number, y: number): TextBlock | null {
  let best: TextBlock | null = null
  for (const b of blocks) {
    const pad = 3
    if (
      x >= b.rect.x - pad &&
      x <= b.rect.x + b.rect.width + pad &&
      y >= b.rect.y - pad &&
      y <= b.rect.y + b.rect.height + pad
    ) {
      if (!best || b.rect.width * b.rect.height < best.rect.width * best.rect.height) best = b
    }
  }
  return best
}
