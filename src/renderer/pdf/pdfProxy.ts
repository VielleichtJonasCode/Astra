import { useEffect, useState } from 'react'
import { openPdf, type OpenedPdf } from './pdfjs'
import { useDocStore } from '../store/docStore'
import { usePasswordStore } from '../store/passwordStore'

interface CacheEntry {
  bytesRef: Uint8Array
  promise: Promise<OpenedPdf>
  password?: string
}

const cache = new Map<string, CacheEntry>()

function loadFor(docKey: string): CacheEntry {
  const doc = useDocStore.getState().getDoc(docKey)
  if (!doc) throw new Error('Dokument nicht gefunden')
  const existing = cache.get(docKey)
  if (existing && existing.bytesRef === doc.originalBytes) return existing

  existing?.promise.then((o) => o.proxy.destroy()).catch(() => undefined)

  const entry: CacheEntry = {
    bytesRef: doc.originalBytes,
    promise: openPdf(doc.originalBytes, (reason) =>
      usePasswordStore.getState().ask(reason, doc.name)
    )
  }
  entry.promise.then((o) => (entry.password = o.password)).catch(() => undefined)
  cache.set(docKey, entry)
  return entry
}

export function dropPdfProxy(docKey: string): void {
  const entry = cache.get(docKey)
  entry?.promise.then((o) => o.proxy.destroy()).catch(() => undefined)
  cache.delete(docKey)
}

export function getPdfPassword(docKey: string): string | undefined {
  return cache.get(docKey)?.password
}

export interface PdfProxyState {
  proxy: OpenedPdf['proxy'] | null
  loading: boolean
  error: string | null
}

/** Reaktiver Zugriff auf den pdf.js-Proxy des Dokuments. */
export function usePdfProxy(docKey: string | null): PdfProxyState {
  const originalBytes = useDocStore((s) =>
    docKey ? s.docs[docKey]?.originalBytes : undefined
  )
  const [state, setState] = useState<PdfProxyState>({ proxy: null, loading: true, error: null })

  useEffect(() => {
    if (!docKey || !originalBytes) {
      setState({ proxy: null, loading: false, error: null })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      loadFor(docKey)
        .promise.then((opened) => {
          if (!cancelled) setState({ proxy: opened.proxy, loading: false, error: null })
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
            setState({ proxy: null, loading: false, error: msg })
          }
        })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setState({ proxy: null, loading: false, error: msg })
    }
    return () => {
      cancelled = true
    }
  }, [docKey, originalBytes])

  return state
}
