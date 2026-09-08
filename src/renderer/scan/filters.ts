export type ScanMode = 'color' | 'gray' | 'bw' | 'text'

export const SCAN_MODE_LABEL: Record<ScanMode, string> = {
  color: 'Farbe',
  gray: 'Grau',
  text: 'Verbessert',
  bw: 'S/W'
}

/** Kontrast-/Helligkeitskurve auf ImageData anwenden (in place). */
function applyBrightnessContrast(d: Uint8ClampedArray, brightness: number, contrast: number): void {
  const b = brightness // -100..100
  const c = contrast // -100..100
  const f = (259 * (c + 255)) / (255 * (259 - c))
  for (let i = 0; i < d.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) {
      d[i + ch] = f * (d[i + ch] - 128) + 128 + b
    }
  }
}

/** Automatischer Weißabgleich / Kontrast-Streckung pro Kanal (1.–99. Perzentil). */
function autoLevels(d: Uint8ClampedArray): void {
  for (let ch = 0; ch < 3; ch++) {
    const hist = new Uint32Array(256)
    let n = 0
    for (let i = ch; i < d.length; i += 4) {
      hist[d[i]]++
      n++
    }
    const lowCut = n * 0.01
    const highCut = n * 0.01
    let lo = 0
    let hi = 255
    let acc = 0
    for (let v = 0; v < 256; v++) {
      acc += hist[v]
      if (acc > lowCut) {
        lo = v
        break
      }
    }
    acc = 0
    for (let v = 255; v >= 0; v--) {
      acc += hist[v]
      if (acc > highCut) {
        hi = v
        break
      }
    }
    const range = Math.max(1, hi - lo)
    for (let i = ch; i < d.length; i += 4) {
      d[i] = ((d[i] - lo) / range) * 255
    }
  }
}

function toGray(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = g
  }
}

/**
 * Adaptive Schwellwertbildung (lokaler Mittelwert via Integralbild).
 * Ergibt saubere Schwarz-Weiß-Scans auch bei ungleicher Ausleuchtung.
 */
function adaptiveThreshold(img: ImageData, windowFrac = 0.06, offset = 10): void {
  const { width: w, height: h, data: d } = img
  const gray = new Float64Array(w * h)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  }
  // Integralbild
  const integ = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x]
      integ[(y + 1) * (w + 1) + (x + 1)] = integ[y * (w + 1) + (x + 1)] + rowSum
    }
  }
  const rad = Math.max(6, Math.floor(Math.min(w, h) * windowFrac))
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - rad)
    const y1 = Math.min(h - 1, y + rad)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - rad)
      const x1 = Math.min(w - 1, x + rad)
      const area = (x1 - x0 + 1) * (y1 - y0 + 1)
      const sum =
        integ[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integ[y0 * (w + 1) + (x1 + 1)] -
        integ[(y1 + 1) * (w + 1) + x0] +
        integ[y0 * (w + 1) + x0]
      const mean = sum / area
      const p = y * w + x
      const val = gray[p] <= mean - offset ? 0 : 255
      const i = p * 4
      d[i] = d[i + 1] = d[i + 2] = val
      d[i + 3] = 255
    }
  }
}

/** Nachbearbeitung eines entzerrten Scans nach Modus. Verändert `img` in place. */
export function finishScan(img: ImageData, mode: ScanMode, brightness = 0, contrast = 0): void {
  if (brightness !== 0 || contrast !== 0) applyBrightnessContrast(img.data, brightness, contrast)
  switch (mode) {
    case 'color':
      break
    case 'gray':
      autoLevels(img.data)
      toGray(img.data)
      break
    case 'text':
      autoLevels(img.data)
      applyBrightnessContrast(img.data, 6, 28)
      break
    case 'bw':
      adaptiveThreshold(img)
      break
  }
}
