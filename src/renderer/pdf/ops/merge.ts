import { PDFDocument } from 'pdf-lib'

export interface MergeSource {
  name: string
  bytes: Uint8Array
  /** Optionaler Seitenbereich (0-basiert); leer = alle. */
  pages?: number[]
}

/** Fügt mehrere PDFs in der übergebenen Reihenfolge zu einem zusammen. */
export async function mergePdfs(sources: MergeSource[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const src of sources) {
    const doc = await PDFDocument.load(src.bytes, { ignoreEncryption: true })
    const indices = src.pages && src.pages.length ? src.pages : doc.getPageIndices()
    const copied = await out.copyPages(doc, indices)
    for (const p of copied) out.addPage(p)
  }
  out.setProducer('PDF Studio')
  out.setCreationDate(new Date())
  return out.save({ useObjectStreams: true })
}
