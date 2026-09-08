import { nanoid } from 'nanoid'
import { dataUrlToBytes } from './bytes'

export interface SavedSignature {
  id: string
  label: string
  kind: 'draw' | 'image'
  /** kind === 'draw': Strichzüge, normiert 0..1. */
  paths?: { x: number; y: number }[][]
  /** kind === 'image': PNG-Data-URL. */
  dataUrl?: string
  /** Höhe / Breite. */
  aspect: number
}

const KEY = 'astra.signatures'

export function loadSignatures(): SavedSignature[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SavedSignature[]) : []
  } catch {
    return []
  }
}

export function saveSignature(sig: Omit<SavedSignature, 'id'>): SavedSignature {
  const entry: SavedSignature = { id: nanoid(8), ...sig }
  const list = [entry, ...loadSignatures()].slice(0, 8)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
  return entry
}

export function deleteSignature(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadSignatures().filter((s) => s.id !== id)))
  } catch {
    /* ignore */
  }
}

/** Wandelt eine gespeicherte Signatur in Platzierungs-Parameter um. */
export function signatureToPlacement(sig: SavedSignature): {
  kind: 'draw' | 'image'
  paths?: { x: number; y: number }[][]
  bytes?: Uint8Array
  mime?: string
  aspect: number
} {
  if (sig.kind === 'image' && sig.dataUrl) {
    return {
      kind: 'image',
      bytes: dataUrlToBytes(sig.dataUrl),
      mime: 'image/png',
      aspect: sig.aspect
    }
  }
  return { kind: 'draw', paths: sig.paths ?? [], aspect: sig.aspect }
}
