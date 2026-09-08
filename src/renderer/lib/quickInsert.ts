import { nanoid } from 'nanoid'
import { useDocStore } from '../store/docStore'
import { useUiStore } from '../store/uiStore'
import { pageDisplaySize, type Annotation } from '../pdf/model'
import { bytesToBlob } from './bytes'

function currentPageId(): {
  docKey: string
  pageId: string
  size: { width: number; height: number }
} | null {
  const doc = useDocStore.getState().activeDoc()
  if (!doc) return null
  const idx = Math.min(useUiStore.getState().currentPage, doc.pages.length) - 1
  const page = doc.pages[Math.max(0, idx)]
  if (!page) return null
  return { docKey: doc.key, pageId: page.id, size: pageDisplaySize(page) }
}

async function imageNaturalSize(
  bytes: Uint8Array,
  mime: string
): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(bytesToBlob(bytes, mime))
  try {
    const img = new Image()
    img.src = url
    await img.decode().catch(() => undefined)
    return { w: img.naturalWidth || 240, h: img.naturalHeight || 160 }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function place(docKey: string, a: Annotation): void {
  useDocStore.getState().addAnnotation(docKey, a)
  useUiStore.getState().selectAnnotations([a.id])
  useUiStore.getState().setTool('select')
}

/** Öffnet den Bild-Dialog (Nutzergeste!) und platziert das Bild mittig auf der aktuellen Seite. */
export function pickAndInsertImage(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg'
  input.style.display = 'none'
  input.onchange = async () => {
    const file = input.files?.[0]
    input.remove()
    if (!file) return
    const target = currentPageId()
    if (!target) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    const mime = file.type || 'image/png'
    const { w: natW, h: natH } = await imageNaturalSize(bytes, mime)
    const w = Math.min(260, target.size.width * 0.5)
    const h = (natH / natW) * w
    const assetId = useDocStore.getState().addAsset(target.docKey, { type: 'image', mime, bytes })
    place(target.docKey, {
      id: nanoid(10),
      pageId: target.pageId,
      kind: 'image',
      assetId,
      rect: {
        x: (target.size.width - w) / 2,
        y: (target.size.height - h) / 2,
        width: w,
        height: h
      }
    })
  }
  document.body.appendChild(input)
  input.click()
}

/** Platziert eine Unterschrift (Strichzeichnung oder Bild) mittig auf der aktuellen Seite. */
export function placeSignature(sig: {
  kind: 'draw' | 'image'
  paths?: { x: number; y: number }[][]
  bytes?: Uint8Array
  mime?: string
  aspect: number
}): void {
  const target = currentPageId()
  if (!target) return
  const w = Math.min(220, target.size.width * 0.42)
  const h = w * sig.aspect
  const base = {
    id: nanoid(10),
    pageId: target.pageId,
    kind: 'signature' as const,
    color: '#0a2a66',
    rect: {
      x: (target.size.width - w) / 2,
      y: (target.size.height - h) / 2,
      width: w,
      height: h
    }
  }
  if (sig.kind === 'image' && sig.bytes) {
    const assetId = useDocStore
      .getState()
      .addAsset(target.docKey, { type: 'image', mime: sig.mime || 'image/png', bytes: sig.bytes })
    place(target.docKey, { ...base, assetId })
  } else {
    place(target.docKey, { ...base, paths: sig.paths ?? [] })
  }
}
