import type { OcrRectifyReport, OcrResult } from '@shared/types'

/**
 * Texterkennung für Studienplaner-Notizen.
 * Zuerst der Apple-Vision-Helfer (Bilder + PDF, gut bei Handschrift); fehlt er,
 * fällt es für Bilder auf tesseract.js zurück (nur Text, keine Boxen).
 */

const IMG_EXT = new Set(['png', 'jpg', 'jpeg'])
/** Bild-Endungen, die vor dem Ablegen begradigt werden können. */
const RECTIFY_EXT = new Set(['png', 'jpg', 'jpeg', 'heic', 'heif', 'webp'])

export type { OcrRectifyReport }

export interface RectifyResult {
  /** Aufbereitete JPEG-Bytes (begradigt, kontrastreich). */
  bytes: Uint8Array
  report: OcrRectifyReport
}

/**
 * Begradigt & säubert ein Scan-Foto über den Vision-Helfer. Gibt `null` zurück,
 * wenn es kein Bild ist oder der Helfer fehlt – der Aufrufer nutzt dann das
 * Originalbild weiter.
 */
export async function rectifyScan(bytes: Uint8Array, ext: string): Promise<RectifyResult | null> {
  if (!RECTIFY_EXT.has(ext.toLowerCase())) return null
  const res = await window.api.ocrRectify({ bytes, ext }).catch(() => null)
  return res && res.bytes?.length ? res : null
}

/**
 * Menschlich lesbarer Hinweis zur Scan-Qualität, oder `null` wenn alles passt.
 * Bewusst sehr konservativ – nur klar schlechte Fotos werden angemerkt, damit
 * saubere Text-Scans (die naturgemäß eine niedrige Kanten-Varianz haben) nicht
 * fälschlich als „unscharf" markiert werden.
 */
export function scanQualityWarning(report: OcrRectifyReport | null | undefined): string | null {
  if (!report) return null
  if (report.reason === 'kein Blatt erkannt' || !report.detected) {
    return 'kein Blatt erkannt – bitte formatfüllend und möglichst gerade fotografieren'
  }
  if (report.coverage > 0 && report.coverage < 0.35) {
    return 'das Blatt füllt das Foto kaum aus'
  }
  // Unschärfe nur anmerken, wenn das Bild auch schlecht ausgerichtet ist –
  // ein gut gefülltes, gerades Blatt mit wenig Text ist meist trotzdem lesbar.
  if (report.blur > 0 && report.blur < 6 && report.coverage < 0.75) {
    return 'das Foto wirkt unscharf'
  }
  return null
}

async function tesseractImage(bytes: Uint8Array, ext: string): Promise<OcrResult | null> {
  if (!IMG_EXT.has(ext.toLowerCase())) return null
  try {
    const { createWorker } = await import('tesseract.js')
    const base = await window.api.prepareOcr(['deu', 'eng'])
    const worker = await createWorker('deu+eng', 1, {
      workerPath: new URL('tesseract/worker.min.js', location.href).href,
      corePath: new URL('tesseract/core/', location.href).href,
      langPath: base,
      gzip: false,
      cacheMethod: 'none'
    })
    const type = ext.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg'
    const blob = new Blob([bytes.slice()], { type })
    const url = URL.createObjectURL(blob)
    try {
      const { data } = await worker.recognize(url)
      return {
        pages: [{ text: data.text, boxes: [], width: 0, height: 0 }],
        text: data.text.trim(),
        engine: 'tesseract'
      }
    } finally {
      URL.revokeObjectURL(url)
      await worker.terminate()
    }
  } catch (err) {
    console.warn('tesseract-Fallback fehlgeschlagen:', err)
    return null
  }
}

export async function recognizeNotes(bytes: Uint8Array, ext: string): Promise<OcrResult | null> {
  const viaVision = await window.api.ocrRecognize({ bytes, ext }).catch(() => null)
  if (viaVision && viaVision.text) return viaVision
  const viaTesseract = await tesseractImage(bytes, ext)
  if (viaTesseract) return viaTesseract
  return viaVision ?? null
}
