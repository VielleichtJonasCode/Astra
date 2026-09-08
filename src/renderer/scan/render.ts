import { PDFDocument } from 'pdf-lib'
import { suggestSize, warpPerspective, type Pt } from './geometry'
import { finishScan, type ScanMode } from './filters'
import { canvasToBytes } from '../image/transform'

export interface ScanPage {
  id: string
  name: string
  src: HTMLCanvasElement
  quad: Pt[]
  mode: ScanMode
  brightness: number
  contrast: number
  rotate: 0 | 90 | 180 | 270
}

/** Standard-Viereck: 6 % vom Rand eingerückt. */
export function defaultQuad(w: number, h: number): Pt[] {
  const mx = w * 0.06
  const my = h * 0.06
  return [
    { x: mx, y: my },
    { x: w - mx, y: my },
    { x: w - mx, y: h - my },
    { x: mx, y: h - my }
  ]
}

function rotateCanvas(src: HTMLCanvasElement, deg: 0 | 90 | 180 | 270): HTMLCanvasElement {
  if (deg === 0) return src
  const swap = deg === 90 || deg === 270
  const out = document.createElement('canvas')
  out.width = swap ? src.height : src.width
  out.height = swap ? src.width : src.height
  const ctx = out.getContext('2d')
  if (!ctx) return src
  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.drawImage(src, -src.width / 2, -src.height / 2)
  return out
}

/** Entzerrt und säubert eine Seite -> fertiges Scan-Canvas. */
export function renderScan(page: ScanPage): HTMLCanvasElement {
  const sctx = page.src.getContext('2d')
  if (!sctx) return page.src
  const srcData = sctx.getImageData(0, 0, page.src.width, page.src.height)
  const { w, h } = suggestSize(page.quad)
  const warped = warpPerspective(srcData, page.quad, w, h)
  finishScan(warped, page.mode, page.brightness, page.contrast)
  const flat = document.createElement('canvas')
  flat.width = w
  flat.height = h
  flat.getContext('2d')?.putImageData(warped, 0, 0)
  return rotateCanvas(flat, page.rotate)
}

/** Alle Seiten zu einem PDF. */
export async function pagesToPdf(pages: ScanPage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const p of pages) {
    const cv = renderScan(p)
    const jpg = await canvasToBytes(cv, 'image/jpeg', 0.85)
    const img = await doc.embedJpg(jpg)
    const pg = doc.addPage([cv.width, cv.height])
    pg.drawImage(img, { x: 0, y: 0, width: cv.width, height: cv.height })
  }
  doc.setProducer('Astra')
  doc.setCreationDate(new Date())
  return doc.save({ useObjectStreams: true })
}
