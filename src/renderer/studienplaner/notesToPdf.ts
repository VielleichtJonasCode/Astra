import type { OcrPage } from '@shared/types'

/**
 * Baut aus gescannten Notizen durchsuchbare PDFs: Das Bild kommt als Seite,
 * darüber liegt der OCR-Text unsichtbar (Deckkraft 0) an der richtigen Stelle.
 * So findet auch die iOS-Dateien-App / Spotlight die Notiz per Volltext.
 */

export interface ScanInput {
  bytes: Uint8Array
  /** "png" | "jpg" | "jpeg" – andere Formate vorher via sips umwandeln. */
  ext: string
  ocr: OcrPage | null
}

const A4_W = 595.28

function drawInvisibleText(
  page: import('pdf-lib').PDFPage,
  font: import('pdf-lib').PDFFont,
  ocr: OcrPage
): void {
  const { width, height } = page.getSize()
  for (const box of ocr.boxes) {
    const text = box.text.trim()
    if (!text) continue
    const size = Math.max(4, box.height * height * 0.82)
    const x = box.x * width
    // OCR-Box: Ursprung oben-links, normalisiert → pdf-lib: unten-links.
    const y = height * (1 - box.y - box.height)
    try {
      page.drawText(text, { x, y, size, font, opacity: 0 })
    } catch {
      // Zeichen außerhalb der Schrift → Box überspringen.
    }
  }
}

/** Ein Bild → einseitiges, durchsuchbares PDF. */
export async function imageToSearchablePdf(input: ScanInput): Promise<Uint8Array> {
  return imagesToSearchablePdf([input])
}

/** Mehrere Bilder → ein mehrseitiges, durchsuchbares PDF. */
export async function imagesToSearchablePdf(inputs: ScanInput[]): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)

  for (const input of inputs) {
    const isPng = input.ext.toLowerCase() === 'png'
    const img = isPng ? await doc.embedPng(input.bytes) : await doc.embedJpg(input.bytes)
    const scale = A4_W / img.width
    const page = doc.addPage([A4_W, img.height * scale])
    page.drawImage(img, { x: 0, y: 0, width: A4_W, height: img.height * scale })
    if (input.ocr) drawInvisibleText(page, font, input.ocr)
  }

  return doc.save()
}

/** Fügt einem vorhandenen PDF eine unsichtbare Textebene hinzu (Seite für Seite). */
export async function addTextLayerToPdf(
  pdfBytes: Uint8Array,
  pages: OcrPage[]
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const docPages = doc.getPages()
  for (let i = 0; i < docPages.length && i < pages.length; i++) {
    if (pages[i]?.boxes?.length) drawInvisibleText(docPages[i], font, pages[i])
  }
  return doc.save()
}
