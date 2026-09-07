import { degrees, rgb, type PDFPage } from 'pdf-lib'
import type { HeaderFooterConfig, OverlayCorner, PdfDoc } from '../model'
import { hexToRgb01 } from '../../lib/color'
import type { FontBook } from '../fonts'

function inPages(pages: number[], n: number): boolean {
  return pages.length === 0 || pages.includes(n)
}

function col(hex: string): ReturnType<typeof rgb> {
  const { r, g, b } = hexToRgb01(hex)
  return rgb(r, g, b)
}

function resolveTokens(tpl: string, doc: PdfDoc, pageNum: number, total: number): string {
  return tpl
    .replace(/\{page\}/g, String(pageNum))
    .replace(/\{pages\}/g, String(total))
    .replace(/\{n\}/g, String(pageNum))
    .replace(/\{N\}/g, String(total))
    .replace(/\{date\}/g, new Date().toLocaleDateString('de-DE'))
    .replace(/\{title\}/g, doc.metadata.title || doc.name.replace(/\.pdf$/i, ''))
    .replace(/\{filename\}/g, doc.name)
}

function cornerXY(
  corner: OverlayCorner,
  textW: number,
  W: number,
  H: number,
  margin: number,
  fontSize: number
): { x: number; y: number } {
  const top = corner.startsWith('top')
  const y = top ? H - margin - fontSize : margin
  let x = margin
  if (corner.endsWith('center')) x = (W - textW) / 2
  else if (corner.endsWith('right')) x = W - margin - textW
  return { x, y }
}

export async function bakeOverlays(
  page: PDFPage,
  doc: PdfDoc,
  pageNum: number,
  total: number,
  fonts: FontBook
): Promise<void> {
  const { width: W, height: H } = page.getSize()
  const ov = doc.overlays

  // ----- Wasserzeichen -----
  const wm = ov.watermark
  if (wm && wm.kind === 'text' && wm.text && inPages(wm.pages, pageNum)) {
    const { font } = await fonts.getFor('Helvetica-Bold', wm.text)
    const color = col(wm.color)
    const draw = (cx: number, cy: number): void => {
      const w = font.widthOfTextAtSize(wm.text, wm.fontSize)
      page.drawText(wm.text, {
        x: cx - w / 2,
        y: cy - wm.fontSize / 2,
        size: wm.fontSize,
        font,
        color,
        opacity: wm.opacity,
        rotate: degrees(wm.rotation)
      })
    }
    if (wm.layout === 'tiled') {
      const step = Math.max(140, wm.fontSize * 6)
      for (let x = 0; x < W + step; x += step) {
        for (let y = 0; y < H + step; y += step) draw(x, y)
      }
    } else {
      draw(W / 2, H / 2)
    }
  }
  // Bild-Wasserzeichen: über eine Bild-Annotation lösbar; hier nur Text.

  // ----- Seitenzahlen / Bates -----
  const pn = ov.pageNumbers
  if (pn && inPages(pn.pages, pageNum)) {
    const value = pn.template
      .replace(/\{prefix\}/g, pn.prefix)
      .replace(/\{n\}/g, String(pn.start - 1 + pageNum))
      .replace(/\{N\}/g, String(pn.start - 1 + total))
      .replace(/\{page\}/g, String(pn.start - 1 + pageNum))
      .replace(/\{pages\}/g, String(pn.start - 1 + total))
    const { font } = await fonts.getFor('Helvetica', value)
    const tw = font.widthOfTextAtSize(value, pn.fontSize)
    const { x, y } = cornerXY(pn.corner, tw, W, H, pn.margin, pn.fontSize)
    page.drawText(value, { x, y, size: pn.fontSize, font, color: col(pn.color) })
  }

  // ----- Kopf-/Fußzeile -----
  const hf = ov.headerFooter
  if (hf && inPages(hf.pages, pageNum)) {
    const font = await fonts.get('Helvetica')
    const color = col(hf.color)
    const put = (
      text: string,
      band: 'header' | 'footer',
      align: 'left' | 'center' | 'right'
    ): void => {
      const resolved = resolveTokens(text, doc, pageNum, total)
      if (!resolved) return
      const tw = font.widthOfTextAtSize(resolved, hf.fontSize)
      const x =
        align === 'left' ? hf.margin : align === 'center' ? (W - tw) / 2 : W - hf.margin - tw
      const y = band === 'header' ? H - hf.margin - hf.fontSize : hf.margin
      page.drawText(resolved, { x, y, size: hf.fontSize, font, color })
    }
    const bands: [keyof HeaderFooterConfig & ('header' | 'footer'), 'header' | 'footer'][] = [
      ['header', 'header'],
      ['footer', 'footer']
    ]
    for (const [k, band] of bands) {
      const cfg = hf[k]
      put(cfg.left, band, 'left')
      put(cfg.center, band, 'center')
      put(cfg.right, band, 'right')
    }
  }
}

export function hasOverlays(doc: PdfDoc): boolean {
  const o = doc.overlays
  return Boolean(o.watermark || o.pageNumbers || o.headerFooter)
}
