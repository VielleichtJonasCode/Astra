import { degrees, rgb, type Color, type PDFDocument, type PDFPage } from 'pdf-lib'
import type {
  Annotation,
  ImageAnnotation,
  InkAnnotation,
  MarkupAnnotation,
  NoteAnnotation,
  PdfDoc,
  ShapeAnnotation,
  SignatureAnnotation,
  StampAnnotation,
  TextAnnotation
} from './model'
import type { Rect } from '../lib/geometry'
import { hexToRgb01 } from '../lib/color'
import { FontBook } from './fonts'

export function hasBakeableContent(annotations: Annotation[]): boolean {
  return annotations.length > 0
}

interface PageCtx {
  /** Angezeigte (ggf. rotierte) Seitengröße in Punkten. */
  dispW: number
  dispH: number
  /** /Rotate-Wert der Ausgabeseite. */
  rotation: number
}

/** Overlay-Rechteck (oben-links) → pdf-lib-Zeichenraum (unten-links, unrotiert). */
function toPdf(r: Rect, ctx: PageCtx): { x: number; y: number; w: number; h: number; angle: number } {
  const { dispW, dispH, rotation } = ctx
  const uw = rotation === 90 || rotation === 270 ? dispH : dispW
  const uh = rotation === 90 || rotation === 270 ? dispW : dispH

  const map = (ox: number, oy: number): [number, number] => {
    switch (rotation) {
      case 90:
        return [oy, ox]
      case 180:
        return [uw - ox, oy]
      case 270:
        return [uw - oy, uh - ox]
      default:
        return [ox, uh - oy]
    }
  }
  const [x1, y1] = map(r.x, r.y)
  const [x2, y2] = map(r.x + r.width, r.y + r.height)
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
    angle: -rotation
  }
}

function col(hex: string): Color {
  const { r, g, b } = hexToRgb01(hex)
  return rgb(r, g, b)
}

function sanitize(text: string): string {
  // Zeichen, die WinAnsi nicht kann, ersetzen (Unicode-Font übernimmt den Rest via FontBook.getFor)
  return text.replace(/\r/g, '')
}

export async function bakePageAnnotations(
  out: PDFDocument,
  page: PDFPage,
  doc: PdfDoc,
  annotations: Annotation[],
  fonts: FontBook
): Promise<void> {
  const { width: dispW, height: dispH } = page.getSize()
  const ctx: PageCtx = { dispW, dispH, rotation: page.getRotation().angle }

  for (const a of annotations) {
    const opacity = a.opacity ?? 1
    try {
      switch (a.kind) {
        case 'text':
          await drawText(page, a, ctx, fonts, opacity)
          break
        case 'highlight':
        case 'underline':
        case 'strikeout':
          drawMarkup(page, a, ctx)
          break
        case 'ink':
          drawInk(page, a, ctx, opacity)
          break
        case 'rect':
        case 'ellipse':
        case 'line':
        case 'arrow':
          drawShape(page, a, ctx, opacity)
          break
        case 'image':
          await drawImage(out, page, doc, a, ctx, opacity)
          break
        case 'note':
          drawNote(page, a, ctx)
          break
        case 'stamp':
          await drawStamp(page, a, ctx, fonts)
          break
        case 'signature':
          drawSignature(page, a, ctx, opacity)
          break
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('bake annotation failed', a.kind, err)
    }
  }
}

async function drawText(
  page: PDFPage,
  a: TextAnnotation,
  ctx: PageCtx,
  fonts: FontBook,
  opacity: number
): Promise<void> {
  const box = toPdf(a.rect, ctx)
  const s = a.style
  const text = sanitize(a.text)

  if (a.cover) {
    page.drawRectangle({
      x: box.x,
      y: box.y,
      width: box.w,
      height: box.h,
      color: col(a.cover.color),
      rotate: degrees(box.angle)
    })
  }

  const { font } = await fonts.getFor(s.font, text || ' ')
  const lineHeight = s.size * s.lineHeight
  const lines = wrapText(text, font, s.size, box.w)
  let y = box.y + box.h - s.size

  for (const line of lines) {
    let x = box.x
    if (s.align !== 'left') {
      const w = safeWidth(font, line, s.size)
      x = s.align === 'center' ? box.x + (box.w - w) / 2 : box.x + box.w - w
    }
    page.drawText(line, {
      x,
      y,
      size: s.size,
      font,
      color: col(s.color),
      opacity,
      rotate: degrees(box.angle)
    })
    y -= lineHeight
  }
}

function safeWidth(font: { widthOfTextAtSize: (t: string, s: number) => number }, t: string, size: number): number {
  try {
    return font.widthOfTextAtSize(t, size)
  } catch {
    return t.length * size * 0.5
  }
}

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number
): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('')
      continue
    }
    let line = ''
    for (const word of paragraph.split(/(\s+)/)) {
      const candidate = line + word
      if (safeWidth(font, candidate, size) > maxWidth && line) {
        out.push(line.trimEnd())
        line = word.trimStart()
      } else {
        line = candidate
      }
    }
    if (line) out.push(line.trimEnd())
  }
  return out.length ? out : ['']
}

function drawMarkup(page: PDFPage, a: MarkupAnnotation, ctx: PageCtx): void {
  const color = col(a.color)
  for (const quad of a.quads.length ? a.quads : [a.rect]) {
    const b = toPdf(quad, ctx)
    if (a.kind === 'highlight') {
      page.drawRectangle({
        x: b.x,
        y: b.y,
        width: b.w,
        height: b.h,
        color,
        opacity: a.opacity ?? 0.4,
        rotate: degrees(b.angle)
      })
    } else {
      const yy = a.kind === 'underline' ? b.y + 1 : b.y + b.h * 0.45
      page.drawLine({
        start: { x: b.x, y: yy },
        end: { x: b.x + b.w, y: yy },
        thickness: Math.max(1, a.rect.height * 0.06),
        color
      })
    }
  }
}

function drawInk(page: PDFPage, a: InkAnnotation, ctx: PageCtx, opacity: number): void {
  const b = toPdf(a.rect, ctx)
  const color = col(a.color)
  for (const path of a.paths) {
    for (let i = 1; i < path.length; i++) {
      const p0 = liftPoint(path[i - 1], b, ctx.rotation)
      const p1 = liftPoint(path[i], b, ctx.rotation)
      page.drawLine({
        start: p0,
        end: p1,
        thickness: a.width,
        color,
        opacity,
        lineCap: 1
      })
    }
  }
}

/** Punkt in 0..1 relativ zur Annotation-Bbox → pdf-lib-Koordinate. */
function liftPoint(
  pt: { x: number; y: number },
  b: { x: number; y: number; w: number; h: number },
  rotation: number
): { x: number; y: number } {
  // pt.y ist im Overlay-System (0 = oben). In pdf steigt y nach oben.
  if (rotation === 0) return { x: b.x + pt.x * b.w, y: b.y + (1 - pt.y) * b.h }
  // Für rotierte Seiten grobe Näherung
  return { x: b.x + pt.x * b.w, y: b.y + (1 - pt.y) * b.h }
}

function drawShape(page: PDFPage, a: ShapeAnnotation, ctx: PageCtx, opacity: number): void {
  const b = toPdf(a.rect, ctx)
  const stroke = col(a.stroke)
  const fill = a.fill ? col(a.fill) : undefined

  if (a.kind === 'rect') {
    page.drawRectangle({
      x: b.x,
      y: b.y,
      width: b.w,
      height: b.h,
      borderColor: stroke,
      borderWidth: a.strokeWidth,
      color: fill,
      opacity: fill ? opacity : undefined,
      borderOpacity: opacity,
      rotate: degrees(b.angle)
    })
  } else if (a.kind === 'ellipse') {
    page.drawEllipse({
      x: b.x + b.w / 2,
      y: b.y + b.h / 2,
      xScale: b.w / 2,
      yScale: b.h / 2,
      borderColor: stroke,
      borderWidth: a.strokeWidth,
      color: fill,
      opacity: fill ? opacity : undefined,
      borderOpacity: opacity
    })
  } else {
    const from = a.from ?? { x: 0, y: 1 }
    const to = a.to ?? { x: 1, y: 0 }
    const p0 = { x: b.x + from.x * b.w, y: b.y + (1 - from.y) * b.h }
    const p1 = { x: b.x + to.x * b.w, y: b.y + (1 - to.y) * b.h }
    page.drawLine({ start: p0, end: p1, thickness: a.strokeWidth, color: stroke, opacity })
    if (a.kind === 'arrow') {
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x)
      const head = 8 + a.strokeWidth * 2
      for (const off of [Math.PI - 0.4, Math.PI + 0.4]) {
        page.drawLine({
          start: p1,
          end: { x: p1.x + head * Math.cos(ang + off), y: p1.y + head * Math.sin(ang + off) },
          thickness: a.strokeWidth,
          color: stroke,
          opacity
        })
      }
    }
  }
}

async function drawImage(
  out: PDFDocument,
  page: PDFPage,
  doc: PdfDoc,
  a: ImageAnnotation,
  ctx: PageCtx,
  opacity: number
): Promise<void> {
  const asset = doc.assets[a.assetId]
  if (!asset) return
  const img =
    asset.mime === 'image/png' ? await out.embedPng(asset.bytes) : await out.embedJpg(asset.bytes)
  const b = toPdf(a.rect, ctx)
  page.drawImage(img, { x: b.x, y: b.y, width: b.w, height: b.h, opacity, rotate: degrees(b.angle) })
}

function drawNote(page: PDFPage, a: NoteAnnotation, ctx: PageCtx): void {
  const b = toPdf(a.rect, ctx)
  const size = Math.min(b.w, b.h, 22)
  page.drawRectangle({
    x: b.x,
    y: b.y + b.h - size,
    width: size,
    height: size,
    color: col(a.color),
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.5,
    opacity: 0.9
  })
}

async function drawStamp(page: PDFPage, a: StampAnnotation, ctx: PageCtx, fonts: FontBook): Promise<void> {
  const b = toPdf(a.rect, ctx)
  const color = col(a.color)
  page.drawRectangle({
    x: b.x,
    y: b.y,
    width: b.w,
    height: b.h,
    borderColor: color,
    borderWidth: 2,
    rotate: degrees(b.angle)
  })
  const { font } = await fonts.getFor('Helvetica-Bold', a.label)
  const size = Math.min(b.h * 0.5, 18)
  const w = safeWidth(font, a.label, size)
  page.drawText(a.label, {
    x: b.x + (b.w - w) / 2,
    y: b.y + (b.h - size) / 2 + size * 0.15,
    size,
    font,
    color,
    rotate: degrees(b.angle)
  })
}

function drawSignature(page: PDFPage, a: SignatureAnnotation, ctx: PageCtx, opacity: number): void {
  if (!a.paths) return
  const b = toPdf(a.rect, ctx)
  const color = col(a.color)
  for (const path of a.paths) {
    for (let i = 1; i < path.length; i++) {
      page.drawLine({
        start: { x: b.x + path[i - 1].x * b.w, y: b.y + (1 - path[i - 1].y) * b.h },
        end: { x: b.x + path[i].x * b.w, y: b.y + (1 - path[i].y) * b.h },
        thickness: 1.6,
        color,
        opacity,
        lineCap: 1
      })
    }
  }
}
