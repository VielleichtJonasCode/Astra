import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

const perDoc = new WeakMap<PDFDocumentProxy, Map<number, Promise<PDFPageProxy>>>()

/** Holt eine pdf.js-Seite (1-basiert) mit Cache pro Dokument. */
export function getCachedPage(proxy: PDFDocumentProxy, pageNumber: number): Promise<PDFPageProxy> {
  let map = perDoc.get(proxy)
  if (!map) {
    map = new Map()
    perDoc.set(proxy, map)
  }
  let promise = map.get(pageNumber)
  if (!promise) {
    promise = proxy.getPage(pageNumber)
    map.set(pageNumber, promise)
  }
  return promise
}
