import { degrees, PDFDocument, type PDFPage } from 'pdf-lib'
import type { Asset, PdfDoc } from './model'
import { bakePageAnnotations, hasBakeableContent } from './bakeAnnotations'
import { bakeOverlays, hasOverlays } from './ops/overlays'
import { FontBook } from './fonts'
import { applyRedactionsAndSecurity, needsMuPdfPass } from './mupdf/postProcess'

export interface ExportOptions {
  /** Nur diese Seitenindizes (0-basiert) ausgeben – für "Auswahl extrahieren". */
  pageIndices?: number[]
  /** Metadaten aus dem Modell schreiben. */
  writeMetadata?: boolean
}

/**
 * Übersetzt das Dokumentmodell in fertige PDF-Bytes.
 * 1. pdf-lib: Seitenreihenfolge, Rotation, Größe, eingefügte Seiten, Annotationen
 * 2. optional MuPDF: echte Redaktionen, Verschlüsselung, Kompression
 */
export async function buildOutputPdf(doc: PdfDoc, options: ExportOptions = {}): Promise<Uint8Array> {
  const original = await PDFDocument.load(doc.originalBytes, {
    ignoreEncryption: true,
    updateMetadata: false
  })

  const externalCache = new Map<string, PDFDocument>()
  const loadExternal = async (asset: Asset): Promise<PDFDocument> => {
    let cached = externalCache.get(asset.id)
    if (!cached) {
      cached = await PDFDocument.load(asset.bytes, { ignoreEncryption: true })
      externalCache.set(asset.id, cached)
    }
    return cached
  }

  const out = await PDFDocument.create()
  const fonts = new FontBook(out)

  const pages = options.pageIndices
    ? options.pageIndices.map((i) => doc.pages[i]).filter(Boolean)
    : doc.pages
  const overlaysWanted = hasOverlays(doc) && !options.pageIndices
  const total = pages.length

  let pageNum = 0
  for (const page of pages) {
    pageNum += 1
    let outPage: PDFPage

    if (page.source.kind === 'original') {
      const [copied] = await out.copyPages(original, [page.source.index])
      out.addPage(copied)
      outPage = copied
    } else if (page.source.kind === 'external') {
      const ext = doc.assets[page.source.docKey]
      if (!ext || ext.type !== 'pdf') {
        outPage = out.addPage([page.baseWidth, page.baseHeight])
      } else {
        const src = await loadExternal(ext)
        const [copied] = await out.copyPages(src, [page.source.index])
        out.addPage(copied)
        outPage = copied
      }
    } else if (page.source.kind === 'image') {
      const asset = doc.assets[page.source.assetId]
      outPage = out.addPage([page.source.width, page.source.height])
      if (asset) {
        const img =
          asset.mime === 'image/png'
            ? await out.embedPng(asset.bytes)
            : await out.embedJpg(asset.bytes)
        outPage.drawImage(img, {
          x: 0,
          y: 0,
          width: page.source.width,
          height: page.source.height
        })
      }
    } else {
      outPage = out.addPage([page.source.width, page.source.height])
    }

    const s = page.scale && page.scale !== 1 ? page.scale : 1
    if (s !== 1) outPage.scaleContent(s, s)
    if (page.resizeTo) {
      // Inhalt (bereits mit s skaliert) mittig im neuen Format platzieren
      const dx = (page.resizeTo.width - page.baseWidth * s) / 2
      const dy = (page.resizeTo.height - page.baseHeight * s) / 2
      if (dx !== 0 || dy !== 0) outPage.translateContent(dx, dy)
      outPage.setSize(page.resizeTo.width, page.resizeTo.height)
    } else if (s !== 1) {
      outPage.setSize(page.baseWidth * s, page.baseHeight * s)
    }
    if (page.cropBox) {
      const { x, y, width, height } = page.cropBox
      outPage.setCropBox(x, y, width, height)
    }
    outPage.setRotation(degrees(page.rotation))

    const annotations = doc.annotations[page.id] ?? []
    if (annotations.length && hasBakeableContent(annotations)) {
      await bakePageAnnotations(out, outPage, doc, annotations, fonts)
    }
    if (overlaysWanted) {
      await bakeOverlays(outPage, doc, pageNum, total, fonts)
    }
  }

  if (options.writeMetadata !== false) {
    const m = doc.metadata
    if (m.title) out.setTitle(m.title)
    if (m.author) out.setAuthor(m.author)
    if (m.subject) out.setSubject(m.subject)
    if (m.keywords) out.setKeywords(m.keywords.split(/[,;]\s*/).filter(Boolean))
    out.setCreator(m.creator || 'PDF Studio')
    out.setProducer('PDF Studio')
    out.setModificationDate(new Date())
  }

  let bytes = await out.save({ useObjectStreams: true })

  if (needsMuPdfPass(doc, options)) {
    bytes = await applyRedactionsAndSecurity(bytes, doc, options)
  }

  return bytes
}
