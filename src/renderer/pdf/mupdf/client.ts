import MuPdfWorker from '../../workers/mupdf.worker?worker'

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, Pending>()

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new MuPdfWorker()
  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, result, error } = e.data as {
      id: number
      ok: boolean
      result?: unknown
      error?: string
    }
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    if (ok) p.resolve(result)
    else p.reject(new Error(error ?? 'MuPDF-Fehler'))
  }
  worker.onerror = (e) => {
    for (const [, p] of pending) p.reject(new Error(e.message || 'MuPDF-Worker abgestürzt'))
    pending.clear()
  }
  return worker
}

function call<T>(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
  const w = ensureWorker()
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    w.postMessage({ id, ...msg }, transfer)
  })
}

export interface MuPdfProcessOptions {
  password?: string
  redactions?: { page: number; rects: [number, number, number, number][] }[]
  encrypt?: { user?: string; owner?: string } | null
  removePassword?: boolean
  compress?: { imageQuality?: number } | null
}

/** Wendet Redaktion / Verschlüsselung / Kompression an und gibt neue Bytes zurück. */
export async function muPdfProcess(
  bytes: Uint8Array,
  ops: MuPdfProcessOptions
): Promise<Uint8Array> {
  const buf = bytes.slice().buffer
  const result = await call<ArrayBuffer>({ type: 'process', bytes: buf, ops }, [buf])
  return new Uint8Array(result)
}

export async function muPdfNeedsPassword(bytes: Uint8Array): Promise<boolean> {
  const buf = bytes.slice().buffer
  return call<boolean>({ type: 'needsPassword', bytes: buf }, [buf])
}

export interface MuStructuredText {
  blocks: {
    type: string
    bbox: { x: number; y: number; w: number; h: number }
    lines?: {
      bbox: { x: number; y: number; w: number; h: number }
      text: string
      font?: { name?: string; size?: number }
      spans?: unknown
    }[]
  }[]
}

export async function muPdfStructuredText(
  bytes: Uint8Array,
  page: number,
  password?: string
): Promise<MuStructuredText> {
  const buf = bytes.slice().buffer
  const json = await call<string>({ type: 'structuredText', bytes: buf, page, password }, [buf])
  return JSON.parse(json) as MuStructuredText
}
