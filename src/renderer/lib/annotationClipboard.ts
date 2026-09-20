import { nanoid } from 'nanoid'
import type { Rect } from './geometry'
import type { Annotation, PageId } from '../pdf/model'
import { useDocStore } from '../store/docStore'
import { useUiStore } from '../store/uiStore'

/**
 * Zwischenablage für Objekte (Textfelder, Formen, Stempel …) – bewusst ein
 * eigener, In-Memory-Speicher statt der System-Zwischenablage: Objekte sind
 * strukturierte Daten (Rect, Stil, Pfade …), kein Text/Bild, das das
 * Betriebssystem sinnvoll darstellen könnte.
 */
let clipboard: Annotation[] = []

function offsetRect(r: Rect, dx: number, dy: number): Rect {
  return { ...r, x: r.x + dx, y: r.y + dy }
}

/** Verschiebt ein geklontes Objekt um (dx, dy) – inklusive aller absoluten
 *  Koordinaten außerhalb von `rect` (Markup-Quads, Text-Deckrechteck). */
function withOffset(a: Annotation, id: string, pageId: PageId, dx: number, dy: number): Annotation {
  const base: Annotation = { ...a, id, pageId, rect: offsetRect(a.rect, dx, dy) }
  if (base.kind === 'highlight' || base.kind === 'underline' || base.kind === 'strikeout') {
    base.quads = base.quads.map((q) => offsetRect(q, dx, dy))
  } else if (base.kind === 'text' && base.cover?.rect) {
    base.cover = { ...base.cover, rect: offsetRect(base.cover.rect, dx, dy) }
  }
  return base
}

/** Aktuelle Auswahl in die Zwischenablage kopieren. Gibt `true` bei Erfolg. */
export function copySelectedAnnotations(): boolean {
  const doc = useDocStore.getState().activeDoc()
  const selected = useUiStore.getState().selectedAnnotations
  if (!doc || !selected.length) return false
  const all = Object.values(doc.annotations).flat()
  const picked = all.filter((a) => selected.includes(a.id))
  if (!picked.length) return false
  clipboard = picked.map((a) => structuredClone(a))
  return true
}

/** Zwischenablage auf die aktuell sichtbare Seite einfügen (leicht versetzt). */
export function pasteAnnotationsFromClipboard(): boolean {
  if (!clipboard.length) return false
  const docs = useDocStore.getState()
  const doc = docs.activeDoc()
  if (!doc) return false
  const page = doc.pages[useUiStore.getState().currentPage - 1]
  if (!page) return false

  const OFFSET = 14
  const pasted = clipboard.map((a) => withOffset(a, nanoid(10), page.id, OFFSET, OFFSET))
  docs.addAnnotations(doc.key, pasted)
  useUiStore.getState().selectAnnotations(pasted.map((a) => a.id))
  // Erneutes Einfügen staffelt vom letzten Einfügeort aus weiter (statt exakt
  // übereinanderzuliegen).
  clipboard = pasted.map((a) => structuredClone(a))
  return true
}
