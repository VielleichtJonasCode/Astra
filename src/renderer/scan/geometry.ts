export interface Pt {
  x: number
  y: number
}

/** Löst ein lineares Gleichungssystem A·x = b (Gauß mit Teilpivotisierung). */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const m = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r
    if (Math.abs(m[piv][col]) < 1e-12) return null
    ;[m[col], m[piv]] = [m[piv], m[col]]
    const d = m[col][col]
    for (let c = col; c <= n; c++) m[col][c] /= d
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = m[r][col]
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c]
    }
  }
  return m.map((row) => row[n])
}

/**
 * Homographie (3×3), die die vier `from`-Punkte auf die vier `to`-Punkte abbildet.
 * Reihenfolge der Punkte: oben-links, oben-rechts, unten-rechts, unten-links.
 */
export function homography(from: Pt[], to: Pt[]): number[] | null {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]
    const { x: X, y: Y } = to[i]
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X])
    b.push(X)
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y])
    b.push(Y)
  }
  const h = solve(A, b)
  return h ? [...h, 1] : null
}

/**
 * Entzerrt das von `quad` umschlossene Viereck aus `src` auf ein Rechteck
 * outW×outH. Rückwärts-Abbildung mit bilinearer Interpolation.
 */
export function warpPerspective(src: ImageData, quad: Pt[], outW: number, outH: number): ImageData {
  // H bildet Ziel-Rechteck -> Quell-Viereck ab (Rückwärts-Sampling).
  const dst: Pt[] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH }
  ]
  const H = homography(dst, quad)
  const out = new ImageData(outW, outH)
  if (!H) return out
  const [a, bb, c, d, e, f, g, h] = H
  const sw = src.width
  const sh = src.height
  const sd = src.data
  const od = out.data
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const w = g * x + h * y + 1
      const u = (a * x + bb * y + c) / w
      const v = (d * x + e * y + f) / w
      const oi = (y * outW + x) * 4
      if (u < 0 || v < 0 || u >= sw - 1 || v >= sh - 1) {
        od[oi] = od[oi + 1] = od[oi + 2] = 255
        od[oi + 3] = 255
        continue
      }
      const x0 = u | 0
      const y0 = v | 0
      const fx = u - x0
      const fy = v - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = i00 + 4
      const i01 = i00 + sw * 4
      const i11 = i01 + 4
      for (let ch = 0; ch < 3; ch++) {
        const top = sd[i00 + ch] * (1 - fx) + sd[i10 + ch] * fx
        const bot = sd[i01 + ch] * (1 - fx) + sd[i11 + ch] * fx
        od[oi + ch] = top * (1 - fy) + bot * fy
      }
      od[oi + 3] = 255
    }
  }
  return out
}

/** Kantenlängen des Vierecks -> geschätzte Zielgröße (längste Seite auf `maxDim`). */
export function suggestSize(quad: Pt[], maxDim = 1654): { w: number; h: number } {
  const dist = (p: Pt, q: Pt): number => Math.hypot(p.x - q.x, p.y - q.y)
  const wTop = dist(quad[0], quad[1])
  const wBot = dist(quad[3], quad[2])
  const hL = dist(quad[0], quad[3])
  const hR = dist(quad[1], quad[2])
  let w = (wTop + wBot) / 2
  let h = (hL + hR) / 2
  const scale = maxDim / Math.max(w, h, 1)
  w = Math.round(w * scale)
  h = Math.round(h * scale)
  return { w: Math.max(64, w), h: Math.max(64, h) }
}

export const A_RATIO = Math.SQRT2 // A4/A5 …
