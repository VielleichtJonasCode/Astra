import type { LoadedFile } from '@shared/types'
import { useDocStore } from '../store/docStore'
import { toast } from '../components/common/toast'

/** Öffnet den nativen Dialog und lädt die Auswahl als Tabs. */
export async function openViaDialog(): Promise<void> {
  const files = await window.api.openDialog()
  if (files && files.length) {
    await useDocStore.getState().openFiles(files.map(normalize))
  }
}

/** Lädt Dateien anhand absoluter Pfade (Dock / "Öffnen mit"). */
export async function openPaths(paths: string[]): Promise<void> {
  const loaded: LoadedFile[] = []
  for (const path of paths) {
    try {
      loaded.push(normalize(await window.api.readFile(path)))
    } catch {
      toast.error(`Konnte ${path.split('/').pop()} nicht laden.`)
    }
  }
  if (loaded.length) await useDocStore.getState().openFiles(loaded)
}

/** Lädt Drag&Drop-Dateien (File-Objekte aus dem Renderer). */
export async function openDroppedFiles(fileList: FileList | File[]): Promise<void> {
  const arr = Array.from(fileList).filter(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  )
  if (!arr.length) return
  const loaded: LoadedFile[] = []
  for (const f of arr) {
    const buf = new Uint8Array(await f.arrayBuffer())
    loaded.push({ path: (f as File & { path?: string }).path ?? '', name: f.name, bytes: buf })
  }
  await useDocStore.getState().openFiles(loaded)
}

function normalize(f: LoadedFile): LoadedFile {
  return {
    ...f,
    bytes: f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes as ArrayBuffer)
  }
}
