import type { PdfDoc } from '../model'
import type { ExportOptions } from '../exportPdf'
import { muPdfProcess } from './client'
import { getPdfPassword } from '../pdfProxy'

/** Braucht die Ausgabe einen MuPDF-Nachlauf (Redaktion / Passwort / Kompression)? */
export function needsMuPdfPass(doc: PdfDoc, _options: ExportOptions): boolean {
  const hasRedactions = Object.values(doc.redactions).some((list) => list.length > 0)
  const hasEncryption = Boolean(doc.encryption?.userPassword || doc.encryption?.ownerPassword)
  const hasCompress = Boolean(doc.postProcess.compress)
  return hasRedactions || hasEncryption || hasCompress
}

export async function applyRedactionsAndSecurity(
  bytes: Uint8Array,
  doc: PdfDoc,
  options: ExportOptions
): Promise<Uint8Array> {
  const outputPages = options.pageIndices
    ? options.pageIndices.map((i) => doc.pages[i]).filter(Boolean)
    : doc.pages

  const redactions: { page: number; rects: [number, number, number, number][] }[] = []
  for (const [pageId, list] of Object.entries(doc.redactions)) {
    if (!list.length) continue
    const idx = outputPages.findIndex((p) => p.id === pageId)
    if (idx < 0) continue
    redactions.push({
      page: idx,
      rects: list.map((r) => [
        r.rect.x,
        r.rect.y,
        r.rect.x + r.rect.width,
        r.rect.y + r.rect.height
      ])
    })
  }

  const enc = doc.encryption
  return muPdfProcess(bytes, {
    password: getPdfPassword(doc.key),
    redactions: redactions.length ? redactions : undefined,
    encrypt:
      enc && (enc.userPassword || enc.ownerPassword)
        ? { user: enc.userPassword, owner: enc.ownerPassword }
        : null,
    compress: doc.postProcess.compress ? { imageQuality: doc.postProcess.compress.quality } : null
  })
}
