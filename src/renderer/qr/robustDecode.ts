import type { LuminanceSource } from '@zxing/library'

/**
 * Robuste QR-/Barcode-Erkennung aus Fotos – deutlich zäher als ein einzelner
 * `decodeFromImageUrl`-Aufruf, der bei schrägen Fotos, schwachem Kontrast (Blendlicht,
 * Schatten), Unschärfe, kleinen Codes oder einem Code, der nur einen kleinen Teil eines
 * großen Fotos einnimmt, oft scheitert.
 *
 * Zwei unabhängige Erkennungs-Engines (ZXing + jsQR, unterschiedliche Algorithmen mit
 * unterschiedlichen Stärken) werden auf mehreren Bild-Varianten probiert: Original,
 * kontrastgestreckt, hochskaliert (kleine Bilder), geschärft (Unschärfe) und – als letzter,
 * teurerer Versuch – vier überlappende Bildausschnitte (falls der Code nur einen Teil des
 * Fotos einnimmt). Beide Engines werden lazy geladen, damit das reine Erstellen eines
 * QR-Codes keinen Decoder lädt.
 */

export interface DecodedCode {
  text: string
  format: string
}

/** Lange Kante, auf die kleine Bilder hochskaliert werden (hilft bei kleinen/unscharfen Codes). */
const UPSCALE_TARGET = 900
/** Lange Kante, auf die sehr große Fotos vor der Analyse begrenzt werden (nur Performance). */
const MAX_LONG_EDGE = 2200

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'))
    img.src = url
  })
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w))
  canvas.height = Math.max(1, Math.round(h))
  return canvas
}

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return canvas.getContext('2d', { willReadFrequently: true })!
}

function drawScaled(img: HTMLImageElement, scale: number): HTMLCanvasElement {
  const canvas = makeCanvas(img.naturalWidth * scale, img.naturalHeight * scale)
  const ctx = ctx2d(canvas)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Graustufen mit auf die volle Spannweite gestrecktem Kontrast (hilft bei Blendlicht/Schatten). */
function contrastStretched(src: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = makeCanvas(src.width, src.height)
  const ctx = ctx2d(canvas)
  ctx.drawImage(src, 0, 0)
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imgData
  const gray = new Uint8ClampedArray(data.length / 4)
  let min = 255
  let max = 0
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const g = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0
    gray[j] = g
    if (g < min) min = g
    if (g > max) max = g
  }
  const range = Math.max(1, max - min)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const v = ((gray[j] - min) * 255) / range
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
  }
  ctx.putImageData(imgData, 0, 0)
  return canvas
}

/** Unscharfmaskierung (3×3-Kantenverstärkung) – hilft bei leicht verwackelten/unscharfen Fotos. */
function sharpened(src: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = makeCanvas(src.width, src.height)
  const ctx = ctx2d(canvas)
  ctx.drawImage(src, 0, 0)
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data, width, height } = imgData
  const orig = Uint8ClampedArray.from(data)
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0
        let k = 0
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++, k++) {
            sum += orig[((y + ky) * width + (x + kx)) * 4 + c] * kernel[k]
          }
        }
        data[(y * width + x) * 4 + c] = sum
      }
    }
  }
  ctx.putImageData(imgData, 0, 0)
  return canvas
}

/** Vier überlappende Ecken-Ausschnitte + Mitte, hochskaliert – für Codes, die nur einen
 *  kleinen Teil eines großen Fotos einnehmen (letzter, teurerer Versuch). */
function tiles(src: HTMLCanvasElement): HTMLCanvasElement[] {
  const { width: w, height: h } = src
  const tw = Math.round(w * 0.6)
  const th = Math.round(h * 0.6)
  const positions: [number, number][] = [
    [0, 0],
    [w - tw, 0],
    [0, h - th],
    [w - tw, h - th],
    [Math.round((w - tw) / 2), Math.round((h - th) / 2)]
  ]
  const scale = Math.max(1, UPSCALE_TARGET / Math.max(tw, th))
  return positions.map(([x, y]) => {
    const canvas = makeCanvas(tw * scale, th * scale)
    const ctx = ctx2d(canvas)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, x, y, tw, th, 0, 0, canvas.width, canvas.height)
    return canvas
  })
}

async function tryJsQR(canvas: HTMLCanvasElement): Promise<DecodedCode | null> {
  const jsQR = (await import('jsqr')).default
  const { data, width, height } = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height)
  const res = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })
  return res ? { text: res.data, format: 'QR_CODE' } : null
}

/** ZXing über alle 4 Drehungen × normal/invertiert × zwei Binarisierer. */
async function tryZxing(canvas: HTMLCanvasElement): Promise<DecodedCode | null> {
  const {
    BarcodeFormat,
    BinaryBitmap,
    DecodeHintType,
    GlobalHistogramBinarizer,
    HTMLCanvasElementLuminanceSource,
    HybridBinarizer,
    MultiFormatReader
  } = await import('@zxing/library')
  const hints = new Map([[DecodeHintType.TRY_HARDER, true]])
  const reader = new MultiFormatReader()

  let source: LuminanceSource = new HTMLCanvasElementLuminanceSource(canvas)
  for (let i = 0; i < 4; i++) {
    for (const variant of [source, source.invert()]) {
      for (const Binarizer of [HybridBinarizer, GlobalHistogramBinarizer]) {
        try {
          const res = reader.decode(new BinaryBitmap(new Binarizer(variant)), hints)
          return { text: res.getText(), format: BarcodeFormat[res.getBarcodeFormat()] ?? 'CODE' }
        } catch {
          // nächste Kombination versuchen
        }
      }
    }
    if (i === 3 || !source.isRotateSupported()) break
    source = source.rotateCounterClockwise()
  }
  return null
}

async function tryBoth(canvas: HTMLCanvasElement): Promise<DecodedCode | null> {
  return (await tryJsQR(canvas)) ?? (await tryZxing(canvas))
}

/** Schneller Versuch für die Live-Kamera: ein Bild, keine Zusatz-Varianten. */
export async function decodeFrameFast(canvas: HTMLCanvasElement): Promise<DecodedCode | null> {
  return tryBoth(canvas)
}

/** Etwas gründlicherer Versuch für die Live-Kamera (alle paar hundert ms statt jeden Frame). */
export async function decodeFrameDeep(canvas: HTMLCanvasElement): Promise<DecodedCode | null> {
  for (const variant of [canvas, contrastStretched(canvas), sharpened(canvas)]) {
    const hit = await tryBoth(variant)
    if (hit) return hit
  }
  return null
}

/** Voller Versuch für ein einzelnes Foto (Datei/Zwischenablage): alle Varianten + Kacheln. */
export async function decodeRobust(url: string): Promise<DecodedCode> {
  const img = await loadImage(url)
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight) || 1
  const baseScale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1
  const base = drawScaled(img, baseScale)

  const variants: HTMLCanvasElement[] = [base, contrastStretched(base)]
  const baseLongEdge = Math.max(base.width, base.height)
  if (baseLongEdge < UPSCALE_TARGET) {
    variants.push(drawScaled(img, baseScale * (UPSCALE_TARGET / baseLongEdge)))
  }
  variants.push(sharpened(base))

  for (const canvas of variants) {
    const hit = await tryBoth(canvas)
    if (hit) return hit
  }

  // Letzter Versuch: der Code nimmt vielleicht nur einen kleinen Teil des Fotos ein.
  for (const tile of tiles(base)) {
    const hit = await tryBoth(tile)
    if (hit) return hit
  }

  throw new Error('Kein Code erkannt.')
}
