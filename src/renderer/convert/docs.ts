import { PDFDocument } from 'pdf-lib'
import { marked } from 'marked'
import { openPdf } from '../pdf/pdfjs'
import { bytesToArrayBuffer } from '../lib/bytes'

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Rahmen-HTML mit dezentem Druck-Stil. */
export function standaloneHtml(bodyHtml: string, title = 'Dokument'): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 12pt/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; margin: 0; }
  h1,h2,h3 { line-height: 1.25; margin: 1.1em 0 .4em; }
  h1 { font-size: 1.9em; } h2 { font-size: 1.45em; } h3 { font-size: 1.2em; }
  p { margin: 0 0 .7em; } ul,ol { margin: 0 0 .8em 1.4em; }
  pre { white-space: pre-wrap; word-wrap: break-word; font: 10.5pt/1.45 ui-monospace, Menlo, monospace; }
  img { max-width: 100%; } table { border-collapse: collapse; }
  td,th { border: 1px solid #ccc; padding: 4px 8px; }
  a { color: #0a63d8; }
</style></head><body>${bodyHtml}</body></html>`
}

export async function docxToHtml(bytes: Uint8Array): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser')
  const res = await mammoth.convertToHtml({ arrayBuffer: bytesToArrayBuffer(bytes) })
  return res.value
}
export async function docxToText(bytes: Uint8Array): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser')
  const res = await mammoth.extractRawText({ arrayBuffer: bytesToArrayBuffer(bytes) })
  return res.value
}

export function mdToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string
}
export function textToHtml(text: string): string {
  return `<pre>${esc(text)}</pre>`
}
export function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\{\\[^{}]*\}/g, '')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\r/g, '')
    .trim()
}
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
/** Sehr leichte HTML→Markdown-Umwandlung (Überschriften, fett, Listen). */
export function htmlToMarkdown(html: string): string {
  return htmlToText(
    html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gis, '\n# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gis, '\n## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gis, '\n### $1\n')
      .replace(/<(strong|b)>(.*?)<\/\1>/gis, '**$2**')
      .replace(/<(em|i)>(.*?)<\/\1>/gis, '*$2*')
      .replace(/<li[^>]*>(.*?)<\/li>/gis, '- $1\n')
  )
}

/** PDF → reiner Text (Seiten durch Leerzeile getrennt). */
export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const { proxy } = await openPdf(bytes, async () => null)
  const pages: string[] = []
  for (let i = 1; i <= proxy.numPages; i++) {
    const page = await proxy.getPage(i)
    const content = await page.getTextContent()
    let text = ''
    let lastY: number | null = null
    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = (item.transform as number[])[5]
      if (lastY !== null && Math.abs(y - lastY) > 3) text += '\n'
      text += item.str
      if (item.hasEOL) text += '\n'
      lastY = y
    }
    pages.push(text.replace(/\n{3,}/g, '\n\n').trim())
  }
  await proxy.destroy()
  return pages.join('\n\n———\n\n')
}

/** PDF → Word (.docx) mit dem Textinhalt (kein Layout). */
export async function pdfToDocx(bytes: Uint8Array): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, TextRun } = await import('docx')
  const { proxy } = await openPdf(bytes, async () => null)
  const children: InstanceType<typeof Paragraph>[] = []
  for (let i = 1; i <= proxy.numPages; i++) {
    if (i > 1) children.push(new Paragraph({ pageBreakBefore: true }))
    const page = await proxy.getPage(i)
    const content = await page.getTextContent()
    let line = ''
    let lastY: number | null = null
    const flush = (): void => {
      if (line.trim()) children.push(new Paragraph({ children: [new TextRun(line.trim())] }))
      line = ''
    }
    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = (item.transform as number[])[5]
      if (lastY !== null && Math.abs(y - lastY) > 3) flush()
      line += item.str
      if (item.hasEOL) flush()
      lastY = y
    }
    flush()
  }
  await proxy.destroy()
  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  return new Uint8Array(await blob.arrayBuffer())
}

/** Bilder → PDF (ein Bild pro Seite). */
export async function imagesToPdf(
  items: { bytes: Uint8Array; ext: string }[]
): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const it of items) {
    const isPng = it.ext === 'png'
    const img = isPng ? await out.embedPng(it.bytes) : await out.embedJpg(it.bytes)
    const w = img.width
    const h = img.height
    const page = out.addPage([w, h])
    page.drawImage(img, { x: 0, y: 0, width: w, height: h })
  }
  out.setProducer('Astra')
  return out.save()
}
