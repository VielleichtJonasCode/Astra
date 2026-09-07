import type { PdfDoc } from '../model'
import { getPdfPassword } from '../pdfProxy'
import { openPdf } from '../pdfjs'
import { buildOutputPdf } from '../exportPdf'

export interface ImageExportOptions {
  format: 'png' | 'jpeg'
  /** Auflösung in DPI (72 = 1:1). */
  dpi: number
  quality?: number
  pageIndices?: number[]
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * Rendert Seiten des (bearbeiteten) Dokuments zu Bilddateien.
 * Nutzt den fertigen Export als Quelle, damit Annotationen/Seitenordnung stimmen.
 */
export async function exportPagesAsImages(
  doc: PdfDoc,
  targetDir: string,
  opts: ImageExportOptions
): Promise<string[]> {
  const finalBytes = await buildOutputPdf(doc)
  const { proxy } = await openPdf(finalBytes, async () => getPdfPassword(doc.key) ?? null)

  const total = proxy.numPages
  const indices = opts.pageIndices ?? Array.from({ length: total }, (_, i) => i)
  const scale = opts.dpi / 72
  const ext = opts.format === 'png' ? 'png' : 'jpg'
  const base = doc.name.replace(/\.pdf$/i, '')
  const written: string[] = []

  for (const idx of indices) {
    if (idx < 0 || idx >= total) continue
    const page = await proxy.getPage(idx + 1)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) continue
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    const dataUrl =
      opts.format === 'png'
        ? canvas.toDataURL('image/png')
        : canvas.toDataURL('image/jpeg', opts.quality ?? 0.9)
    const path = `${targetDir}/${base}-${String(idx + 1).padStart(3, '0')}.${ext}`
    await window.api.writeFile(path, dataUrlToBytes(dataUrl))
    written.push(path)
  }

  await proxy.destroy()
  return written
}
