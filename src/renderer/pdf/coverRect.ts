import type { Rect } from '../lib/geometry'

export interface WordBox {
  x: number
  y: number
  width: number
  height: number
}

export interface CoverPlan {
  /** Enge Bounding-Box der getroffenen Zeile (Deck- und Textbezug). */
  tight: Rect
  /** Deckrechteck: überdeckt die alte Zeile vollständig, ohne die Nachbarzeilen zu berühren. */
  cover: Rect
}

/**
 * Bestimmt für „Text überschreiben":
 *  - die enge Box der getroffenen Zeile (aus echten Wort-Boxen),
 *  - ein Deckrechteck, das die alte Zeile komplett verdeckt, aber im
 *    Zeilenzwischenraum bleibt (Zeile darüber/darunter bleibt frei).
 */
export function planCoverRect(hitRect: Rect, boxes: WordBox[], size: number): CoverPlan {
  const lineTop = hitRect.y
  const lineBottom = hitRect.y + hitRect.height
  const center = (b: WordBox): number => b.y + b.height / 2

  // Großzügig für „gehört zur Zeile", damit `tight` die ganze Zeile erfasst.
  const onLine = (b: WordBox): boolean =>
    center(b) > lineTop - size * 0.35 && center(b) < lineBottom + size * 0.35
  // Nur eindeutig getrennte Zeilen dürfen die Deckfläche begrenzen (Totzone dazwischen).
  const clearlyBelow = (b: WordBox): boolean => center(b) > lineBottom + size * 0.5
  const clearlyAbove = (b: WordBox): boolean => center(b) < lineTop - size * 0.5

  const band = boxes.filter(
    (b) => onLine(b) && b.x + b.width > hitRect.x - 2 && b.x < hitRect.x + hitRect.width + 2
  )
  let tight: Rect = hitRect
  if (band.length) {
    const x0 = Math.min(...band.map((b) => b.x))
    const y0 = Math.min(...band.map((b) => b.y))
    const x1 = Math.max(...band.map((b) => b.x + b.width))
    const y1 = Math.max(...band.map((b) => b.y + b.height))
    tight = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
  }

  let prevLineBottom = -Infinity
  let nextLineTop = Infinity
  for (const b of boxes) {
    if (clearlyBelow(b)) nextLineTop = Math.min(nextLineTop, b.y)
    else if (clearlyAbove(b)) prevLineBottom = Math.max(prevLineBottom, b.y + b.height)
  }

  const bleedX = Math.max(0.5, size * 0.05)
  // Voll über der alten Zeile (Wort-Box + winziger Puffer für Unterlängen).
  let coverTop = tight.y - size * 0.05
  let coverBottom = tight.y + tight.height + size * 0.03
  // Harte Grenze zur nächsten/vorherigen Zeile.
  if (nextLineTop < Infinity) coverBottom = Math.min(coverBottom, nextLineTop - size * 0.05)
  if (prevLineBottom > -Infinity) coverTop = Math.max(coverTop, prevLineBottom + size * 0.05)
  if (coverTop > tight.y) coverTop = tight.y

  return {
    tight,
    cover: {
      x: tight.x - bleedX,
      y: coverTop,
      width: tight.width + bleedX * 2,
      height: Math.max(0, coverBottom - coverTop)
    }
  }
}
