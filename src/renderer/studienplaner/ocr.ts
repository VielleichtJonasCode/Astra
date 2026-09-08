import type { OcrResult } from '@shared/types'

/**
 * Texterkennung für Studienplaner-Notizen.
 * Zuerst der Apple-Vision-Helfer (Bilder + PDF, gut bei Handschrift); fehlt er,
 * fällt es für Bilder auf tesseract.js zurück (nur Text, keine Boxen).
 */

const IMG_EXT = new Set(['png', 'jpg', 'jpeg'])

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
