/// <reference lib="webworker" />
import * as mupdf from 'mupdf'

interface RedactionSpec {
  page: number
  rects: [number, number, number, number][]
}

interface ProcessOps {
  password?: string
  redactions?: RedactionSpec[]
  encrypt?: { user?: string; owner?: string } | null
  removePassword?: boolean
  compress?: { imageQuality?: number } | null
}

type Request =
  | { id: number; type: 'process'; bytes: ArrayBuffer; ops: ProcessOps }
  | { id: number; type: 'structuredText'; bytes: ArrayBuffer; page: number; password?: string }
  | { id: number; type: 'needsPassword'; bytes: ArrayBuffer }

function openDoc(bytes: ArrayBuffer, password?: string): mupdf.PDFDocument {
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  if (doc.needsPassword()) {
    if (!password || doc.authenticatePassword(password) === 0) {
      throw new Error('PASSWORD_REQUIRED')
    }
  }
  return doc as mupdf.PDFDocument
}

self.onmessage = (e: MessageEvent<Request>): void => {
  const req = e.data
  try {
    if (req.type === 'needsPassword') {
      const doc = mupdf.PDFDocument.openDocument(new Uint8Array(req.bytes), 'application/pdf')
      const needs = doc.needsPassword()
      doc.destroy()
      self.postMessage({ id: req.id, ok: true, result: needs })
      return
    }

    if (req.type === 'structuredText') {
      const doc = openDoc(req.bytes, req.password)
      const page = doc.loadPage(req.page)
      const st = page.toStructuredText('preserve-whitespace')
      const json = st.asJSON()
      st.destroy()
      page.destroy()
      doc.destroy()
      self.postMessage({ id: req.id, ok: true, result: json })
      return
    }

    // process
    const { ops } = req
    const doc = openDoc(req.bytes, ops.password)

    if (ops.redactions?.length) {
      for (const spec of ops.redactions) {
        const page = doc.loadPage(spec.page)
        for (const r of spec.rects) {
          const annot = page.createAnnotation('Redact')
          annot.setRect(r)
          annot.update()
        }
        page.applyRedactions(true, 2)
        page.destroy()
      }
    }

    let saveOpts = 'compress'
    if (ops.compress) saveOpts = 'compress,compress-images,garbage=compact'
    if (ops.removePassword) {
      saveOpts += ',decrypt'
    } else if (ops.encrypt && (ops.encrypt.user || ops.encrypt.owner)) {
      saveOpts += ',encrypt=aes-256'
      if (ops.encrypt.user) saveOpts += `,user-password=${ops.encrypt.user}`
      if (ops.encrypt.owner) saveOpts += `,owner-password=${ops.encrypt.owner}`
    }

    const buffer = doc.saveToBuffer(saveOpts)
    const out = buffer.asUint8Array().slice()
    buffer.destroy()
    doc.destroy()
    self.postMessage({ id: req.id, ok: true, result: out.buffer }, { transfer: [out.buffer] })
  } catch (err) {
    self.postMessage({
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    })
  }
}
