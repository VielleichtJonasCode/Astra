import type { PDFDocumentProxy } from 'pdfjs-dist'
import { getCachedPage } from './pageCache'
import { renderThumbnail } from './render'

const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

const THUMB_W = 150

export function thumbKey(docKey: string, pageId: string, rotation: number): string {
  return `${docKey}:${pageId}:${rotation}`
}

export function getCachedThumb(key: string): string | undefined {
  return cache.get(key)
}

/** Rendert (und cached) eine Miniatur für eine Original-Seite. */
export async function loadThumbnail(
  proxy: PDFDocumentProxy,
  docKey: string,
  pageId: string,
  pdfPageNumber: number,
  rotation: number
): Promise<string> {
  const key = thumbKey(docKey, pageId, rotation)
  const hit = cache.get(key)
  if (hit) return hit
  const pending = inflight.get(key)
  if (pending) return pending

  const p = (async () => {
    const page = await getCachedPage(proxy, pdfPageNumber)
    const url = await renderThumbnail(page, THUMB_W, rotation)
    cache.set(key, url)
    inflight.delete(key)
    return url
  })()
  inflight.set(key, p)
  return p
}

export function invalidateDocThumbs(docKey: string): void {
  for (const k of [...cache.keys()]) if (k.startsWith(`${docKey}:`)) cache.delete(k)
}
