import { useDocStore } from '../store/docStore'
import { requestDialog } from '../store/dialogStore'
import { buildOutputPdf } from '../pdf/exportPdf'
import { toast } from '../components/common/toast'

function defaultName(name: string, suffix = ''): string {
  const base = name.replace(/\.pdf$/i, '')
  return `${base}${suffix}.pdf`
}

/** Sichert das aktive Dokument an seinen bekannten Pfad (sonst „Sichern unter"). */
export async function saveActive(): Promise<void> {
  const store = useDocStore.getState()
  const doc = store.activeDoc()
  if (!doc) return
  if (!doc.path) return saveActiveAs()

  const id = toast.info('Sichern …', undefined)
  try {
    const bytes = await buildOutputPdf(doc)
    await window.api.writeFile(doc.path, bytes)
    store.markSaved(doc.key, doc.path, bytes)
    toast.dismiss(id)
    toast.success('Gesichert.')
  } catch (err) {
    toast.dismiss(id)
    toast.error('Sichern fehlgeschlagen.')
    // eslint-disable-next-line no-console
    console.error(err)
  }
}

export async function saveActiveAs(): Promise<void> {
  const store = useDocStore.getState()
  const doc = store.activeDoc()
  if (!doc) return

  const target = await window.api.saveDialog({ defaultName: defaultName(doc.name) })
  if (!target) return

  const id = toast.info('Sichern …', undefined)
  try {
    const bytes = await buildOutputPdf(doc)
    await window.api.writeFile(target, bytes)
    store.markSaved(doc.key, target, bytes)
    toast.dismiss(id)
    toast.success('Gesichert.')
  } catch (err) {
    toast.dismiss(id)
    toast.error('Sichern fehlgeschlagen.')
    // eslint-disable-next-line no-console
    console.error(err)
  }
}

/** Öffnet den Export-Dialog (PDF-Kopie, Seitenbereich, Bilder …). */
export async function exportActive(): Promise<void> {
  if (!useDocStore.getState().activeDoc()) {
    toast.info('Bitte zuerst ein PDF öffnen.')
    return
  }
  requestDialog('export')
}

/** Direkter Bytes-Export ohne Dialog (für Stapelverarbeitung / „extrahieren"). */
export async function exportBytes(
  docKey: string,
  targetPath: string,
  pageIndices?: number[]
): Promise<void> {
  const doc = useDocStore.getState().getDoc(docKey)
  if (!doc) return
  const bytes = await buildOutputPdf(doc, { pageIndices })
  await window.api.writeFile(targetPath, bytes)
}
