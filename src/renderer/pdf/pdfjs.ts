import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const COMMON = {
  cMapUrl: 'pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: 'pdfjs/standard_fonts/',
  isEvalSupported: false
}

export type PasswordPrompt = (reason: 'need' | 'wrong') => Promise<string | null>

export interface OpenedPdf {
  proxy: PDFDocumentProxy
  /** Passwort, mit dem geöffnet wurde (für spätere MuPDF-Schritte). */
  password?: string
}

/** Öffnet ein PDF mit pdf.js, inkl. Passwort-Rückfrage. */
export async function openPdf(bytes: Uint8Array, askPassword?: PasswordPrompt): Promise<OpenedPdf> {
  let password: string | undefined
  // pdf.js überträgt den Buffer in den Worker (detached) – Kopie geben.
  const data = bytes.slice()

  const task = pdfjs.getDocument({ ...COMMON, data })

  if (askPassword) {
    task.onPassword = (updatePassword: (pw: string) => void, reason: number) => {
      const kind = reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD ? 'wrong' : 'need'
      void askPassword(kind).then((pw) => {
        if (pw == null) {
          void task.destroy()
        } else {
          password = pw
          updatePassword(pw)
        }
      })
    }
  }

  const proxy = await task.promise
  return { proxy, password }
}

export async function getPage(proxy: PDFDocumentProxy, pageNumber: number): Promise<PDFPageProxy> {
  return proxy.getPage(pageNumber)
}

export interface TextItemBox {
  str: string
  /** Overlay-Koordinaten (oben-links) in PDF-Punkten, unskaliert. */
  x: number
  y: number
  width: number
  height: number
  fontHeight: number
  fontName: string
}

/**
 * Liefert Textstücke einer Seite mit Bounding-Box im Overlay-System
 * (Ursprung oben-links, PDF-Punkte). Basis für Suche & "Text bearbeiten".
 */
export async function getPageTextBoxes(page: PDFPageProxy): Promise<TextItemBox[]> {
  const content = await page.getTextContent()
  const viewport = page.getViewport({ scale: 1 })
  const out: TextItemBox[] = []
  for (const item of content.items) {
    if (!('str' in item) || item.str.length === 0) continue
    const t = item.transform as number[]
    const fontHeight = Math.hypot(t[2], t[3]) || item.height || 10
    const width = item.width || 0
    // t[4], t[5] = Ursprung (unten-links der Grundlinie) in PDF-Koordinaten
    const x = t[4]
    const yTop = viewport.height - t[5] - fontHeight
    out.push({
      str: item.str,
      x,
      y: yTop,
      width,
      height: fontHeight * 1.15,
      fontHeight,
      fontName: (item as { fontName?: string }).fontName ?? ''
    })
  }
  return out
}

export { pdfjs }
export type { PDFDocumentProxy, PDFPageProxy }
