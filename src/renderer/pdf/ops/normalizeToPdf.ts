import { convertImage } from '../../convert/image'
import {
  docxToHtml,
  imagesToPdf,
  mdToHtml,
  rtfToText,
  standaloneHtml,
  textToHtml
} from '../../convert/docs'

const IMG = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'avif',
  'heic',
  'heif',
  'tif',
  'tiff'
])
const SIPS = new Set(['heic', 'heif', 'tif', 'tiff'])
const DOC = new Set(['docx', 'txt', 'md', 'markdown', 'html', 'htm', 'rtf'])

export type MergeKind = 'pdf' | 'image' | 'document' | 'unknown'

const extOf = (name: string): string => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ''

export function mergeKind(name: string): MergeKind {
  const e = extOf(name)
  if (e === 'pdf') return 'pdf'
  if (IMG.has(e)) return 'image'
  if (DOC.has(e)) return 'document'
  return 'unknown'
}

export const MERGE_KIND_LABEL: Record<MergeKind, string> = {
  pdf: 'PDF',
  image: 'Bild',
  document: 'Dokument',
  unknown: 'nicht unterstützt'
}

/** Wandelt eine beliebige unterstützte Datei in PDF-Bytes um (für die Zusammenführung). */
export async function toPdfBytes(name: string, bytes: Uint8Array): Promise<Uint8Array> {
  const e = extOf(name)
  if (e === 'pdf') return bytes

  if (IMG.has(e)) {
    let b = bytes
    let ext = e === 'jpg' ? 'jpeg' : e
    if (SIPS.has(e)) {
      b = await window.api.sipsConvert({ bytes }, 'png')
      ext = 'png'
    }
    if (ext !== 'png' && ext !== 'jpeg') {
      b = await convertImage(b, ext, 'jpeg', { quality: 0.9 })
      ext = 'jpeg'
    }
    return imagesToPdf([{ bytes: b, ext }])
  }

  if (DOC.has(e)) {
    const dec = new TextDecoder().decode(bytes)
    let body: string
    if (e === 'docx') body = await docxToHtml(bytes)
    else if (e === 'md' || e === 'markdown') body = mdToHtml(dec)
    else if (e === 'rtf') body = textToHtml(rtfToText(dec))
    else if (e === 'html' || e === 'htm') {
      const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(dec)
      body = m ? m[1] : dec
    } else body = textToHtml(dec)
    return window.api.htmlToPdf(standaloneHtml(body, name.replace(/\.[a-z0-9]+$/i, '')))
  }

  throw new Error(`„${name}" wird nicht unterstützt`)
}
