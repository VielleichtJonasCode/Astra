import { openPdf } from '../pdf/pdfjs'
import { baseName, extOf, runnerFor } from './catalog'
import { convertImage } from './image'
import { convertMedia } from './media'
import {
  docxToHtml,
  docxToText,
  htmlToMarkdown,
  htmlToText,
  imagesToPdf,
  mdToHtml,
  pdfToDocx,
  pdfToText,
  rtfToText,
  standaloneHtml,
  textToHtml
} from './docs'

export interface ConvertJob {
  id: string
  name: string
  path: string
  targetExt: string
  /** Direkt übergebene Bytes (z. B. aus Drag & Drop ohne Pfad). */
  bytes?: Uint8Array
}
export interface ResultFile {
  suffix: string
  ext: string
  bytes: Uint8Array
}
export interface RunCallbacks {
  onProgress?: (ratio: number) => void
  onStatus?: (text: string) => void
  quality?: number
  imageDpi?: number
}

const dec = (b: Uint8Array): string => new TextDecoder().decode(b).replace(/^﻿/, '')
const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

async function pdfToImages(
  bytes: Uint8Array,
  targetExt: string,
  dpi: number,
  cb: RunCallbacks
): Promise<ResultFile[]> {
  const mime =
    targetExt === 'png'
      ? 'image/png'
      : targetExt === 'webp'
        ? 'image/webp'
        : targetExt === 'avif'
          ? 'image/avif'
          : 'image/jpeg'
  const ext = targetExt === 'jpg' ? 'jpeg' : targetExt
  const { proxy } = await openPdf(bytes, async () => null)
  const scale = dpi / 72
  const out: ResultFile[] = []
  const pad = String(proxy.numPages).length
  for (let i = 1; i <= proxy.numPages; i++) {
    cb.onProgress?.((i - 1) / proxy.numPages)
    const page = await proxy.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d', { alpha: false })!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('Encode'))), mime, cb.quality ?? 0.92)
    )
    out.push({
      suffix: proxy.numPages > 1 ? `-${String(i).padStart(pad, '0')}` : '',
      ext,
      bytes: new Uint8Array(await blob.arrayBuffer())
    })
  }
  await proxy.destroy()
  return out
}

async function sourceToHtml(bytes: Uint8Array, src: string): Promise<string> {
  if (src === 'docx') return docxToHtml(bytes)
  if (src === 'md' || src === 'markdown') return mdToHtml(dec(bytes))
  if (src === 'rtf') return textToHtml(rtfToText(dec(bytes)))
  if (src === 'html' || src === 'htm') {
    const h = dec(bytes)
    const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(h)
    return m ? m[1] : h
  }
  return textToHtml(dec(bytes))
}

/** Formate, die der Browser nicht dekodiert – vorab über macOS `sips` nach PNG wandeln. */
const SIPS_DECODE = new Set(['heic', 'heif', 'tif', 'tiff'])

export async function runJob(job: ConvertJob, cb: RunCallbacks = {}): Promise<ResultFile[]> {
  let bytes = job.bytes ?? (await window.api.readFile(job.path)).bytes
  let src = extOf(job.name)
  const t = job.targetExt.toLowerCase()

  if (SIPS_DECODE.has(src)) {
    cb.onStatus?.('Bild wird entpackt …')
    bytes = await window.api.sipsConvert({ bytes }, 'png')
    src = 'png'
  }

  const runner = runnerFor(job.name, t)

  switch (runner) {
    case 'image':
      return [
        { suffix: '', ext: t, bytes: await convertImage(bytes, src, t, { quality: cb.quality }) }
      ]

    case 'image-to-pdf': {
      let imgBytes = bytes
      let imgExt = src === 'jpg' ? 'jpeg' : src
      if (imgExt !== 'png' && imgExt !== 'jpeg') {
        imgBytes = await convertImage(bytes, src, 'jpeg', { quality: cb.quality })
        imgExt = 'jpeg'
      }
      return [
        { suffix: '', ext: 'pdf', bytes: await imagesToPdf([{ bytes: imgBytes, ext: imgExt }]) }
      ]
    }

    case 'pdf-to-image':
      return pdfToImages(bytes, t, cb.imageDpi ?? 150, cb)

    case 'pdf-to-text':
      return [{ suffix: '', ext: 'txt', bytes: enc(await pdfToText(bytes)) }]

    case 'pdf-to-docx':
      return [{ suffix: '', ext: 'docx', bytes: await pdfToDocx(bytes) }]

    case 'doc-to-pdf': {
      const html = await sourceToHtml(bytes, src)
      const pdf = await window.api.htmlToPdf(standaloneHtml(html, baseName(job.name)))
      return [{ suffix: '', ext: 'pdf', bytes: pdf }]
    }

    case 'doc-to-text': {
      let result = ''
      if (src === 'docx') {
        result =
          t === 'txt'
            ? await docxToText(bytes)
            : t === 'md'
              ? htmlToMarkdown(await docxToHtml(bytes))
              : standaloneHtml(await docxToHtml(bytes), baseName(job.name))
      } else {
        const raw = dec(bytes)
        const asHtml = await sourceToHtml(bytes, src)
        result =
          t === 'html'
            ? standaloneHtml(asHtml, baseName(job.name))
            : t === 'md'
              ? src === 'html' || src === 'htm'
                ? htmlToMarkdown(raw)
                : raw
              : htmlToText(asHtml)
      }
      return [{ suffix: '', ext: t, bytes: enc(result) }]
    }

    case 'media':
      return [{ suffix: '', ext: t, bytes: await convertMedia(bytes, src, t, cb) }]

    default:
      throw new Error('Diese Umwandlung wird (noch) nicht unterstützt.')
  }
}
