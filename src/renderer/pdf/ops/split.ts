import type { PdfDoc } from '../model'
import { buildOutputPdf } from '../exportPdf'
import { parsePageRanges } from '../../lib/ranges'

export type SplitMode = 'ranges' | 'everyN' | 'single'

export interface SplitConfig {
  mode: SplitMode
  /** Für "ranges": "1-3, 4-6" → je Komma-Gruppe eine Datei. */
  ranges?: string
  /** Für "everyN". */
  n?: number
}

/** Ermittelt die Seiten-Gruppen (0-basiert) für die gewählte Aufteilung. */
export function computeSplitGroups(doc: PdfDoc, cfg: SplitConfig): number[][] {
  const total = doc.pages.length
  if (cfg.mode === 'single') {
    return Array.from({ length: total }, (_, i) => [i])
  }
  if (cfg.mode === 'everyN') {
    const n = Math.max(1, cfg.n ?? 1)
    const groups: number[][] = []
    for (let i = 0; i < total; i += n) {
      groups.push(Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k))
    }
    return groups
  }
  // ranges: jede Komma-Gruppe des Strings wird eine Datei
  return (cfg.ranges ?? '')
    .split(/[,;]/)
    .map((chunk) => parsePageRanges(chunk, total))
    .filter((g) => g.length > 0)
}

export async function runSplit(
  doc: PdfDoc,
  targetDir: string,
  cfg: SplitConfig
): Promise<string[]> {
  const groups = computeSplitGroups(doc, cfg)
  const base = doc.name.replace(/\.pdf$/i, '')
  const written: string[] = []
  const pad = String(groups.length).length

  for (let i = 0; i < groups.length; i++) {
    const bytes = await buildOutputPdf(doc, { pageIndices: groups[i] })
    const path = `${targetDir}/${base}-${String(i + 1).padStart(pad, '0')}.pdf`
    await window.api.writeFile(path, bytes)
    written.push(path)
  }
  return written
}
