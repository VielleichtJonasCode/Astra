import { nanoid } from 'nanoid'
import { PDFDocument } from 'pdf-lib'
import type { LoadedFile } from '@shared/types'
import { DEFAULT_METADATA, type PageModel, type PdfDoc, type Rotation } from './model'

function normRot(angle: number): Rotation {
  return ((((Math.round(angle / 90) * 90) % 360) + 360) % 360) as Rotation
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn()
  } catch {
    return undefined
  }
}

/** Baut ein Dokumentmodell aus Dateibytes (ohne Store). */
export async function buildDoc(file: LoadedFile): Promise<PdfDoc> {
  const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes)
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const pages: PageModel[] = pdf.getPages().map((p, index) => {
    const { width, height } = p.getSize()
    return {
      id: nanoid(10),
      source: { kind: 'original', index },
      rotation: normRot(p.getRotation().angle),
      baseWidth: width,
      baseHeight: height
    }
  })
  return {
    key: nanoid(12),
    name: file.name || 'Unbenannt.pdf',
    path: file.path || null,
    originalBytes: bytes,
    pages,
    annotations: {},
    redactions: {},
    assets: {},
    metadata: {
      ...DEFAULT_METADATA,
      title: safe(() => pdf.getTitle()) ?? '',
      author: safe(() => pdf.getAuthor()) ?? '',
      subject: safe(() => pdf.getSubject()) ?? '',
      keywords: safe(() => pdf.getKeywords()) ?? '',
      creator: safe(() => pdf.getCreator()) ?? 'PDF Studio'
    },
    encryption: null,
    overlays: {},
    postProcess: {},
    dirty: false,
    revision: 0
  }
}
