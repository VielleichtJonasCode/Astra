/**
 * Erzeugt resources/icon.png (1024×1024): kosmischer Verlauf mit Sternen,
 * ein sauberes Dokument in der Mitte und ein eleganter Planeten-Ring (Gold).
 * Reiner PNG-Encoder, keine externen Abhängigkeiten.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const S = 1024
const buf = Buffer.alloc(S * S * 4)
const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)

/** Alpha-Blend eines RGB-Werts auf den Puffer. */
function blend(x, y, r, g, b, a = 1) {
  if (x < 0 || y < 0 || x >= S || y >= S) return
  const i = (y * S + x) * 4
  buf[i] = Math.round(lerp(buf[i], r, a))
  buf[i + 1] = Math.round(lerp(buf[i + 1], g, a))
  buf[i + 2] = Math.round(lerp(buf[i + 2], b, a))
  buf[i + 3] = 255
}

/* ---------- Maske: abgerundetes Quadrat (Big-Sur-Stil) ---------- */
const inset = 88
const radius = 236
function roundRectAlpha(x, y) {
  const x0 = inset
  const y0 = inset
  const x1 = S - inset
  const y1 = S - inset
  if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) return 0
  const cx = Math.min(Math.max(x, x0 + radius), x1 - radius)
  const cy = Math.min(Math.max(y, y0 + radius), y1 - radius)
  const inStraight =
    (x >= x0 && x <= x1 && y >= y0 + radius && y <= y1 - radius) ||
    (y >= y0 && y <= y1 && x >= x0 + radius && x <= x1 - radius)
  if (inStraight) return 1
  const d = Math.hypot(x - cx, y - cy)
  return clamp01(radius - d + 0.5) // weiche 1px-Kante
}

/* ---------- Hintergrund: kosmischer Verlauf + Vignette ---------- */
const bgTop = [36, 26, 82] // #241a52
const bgBot = [10, 99, 230] // #0a63e6
const cxAll = S / 2
const cyAll = S / 2

/* ---------- Sterne ---------- */
let seed = 20260908
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
const stars = Array.from({ length: 26 }, () => ({
  x: inset + rnd() * (S - 2 * inset),
  y: inset + rnd() * (S - 2 * inset),
  r: 1.2 + rnd() * 2.6,
  a: 0.25 + rnd() * 0.6
}))

/* ---------- Dokument ---------- */
const dCx = S / 2
const dCy = S / 2 + 16
const dW = 292
const dH = 384
const dR = 16
const fold = 104
function docShapeAlpha(x, y) {
  const x0 = dCx - dW / 2
  const y0 = dCy - dH / 2
  const x1 = dCx + dW / 2
  const y1 = dCy + dH / 2
  if (x < x0 || x > x1 || y < y0 || y > y1) return 0
  // Eselsohr oben rechts wegschneiden
  if (x > x1 - fold && y < y0 + fold && x - (x1 - fold) > y0 + fold - y) return 0
  // abgerundete Ecken (unten + oben links)
  const corners = [
    [x0 + dR, y0 + dR],
    [x0 + dR, y1 - dR],
    [x1 - dR, y1 - dR]
  ]
  for (const [cx, cy] of corners) {
    if (
      ((x < cx && cx === x0 + dR) || (x > cx && cx === x1 - dR)) &&
      ((y < cy && cy === y0 + dR) || (y > cy && cy === y1 - dR))
    ) {
      if (Math.hypot(x - cx, y - cy) > dR) return 0
    }
  }
  return 1
}
function docFoldAlpha(x, y) {
  const x1 = dCx + dW / 2
  const y0 = dCy - dH / 2
  return x > x1 - fold && x <= x1 && y >= y0 && y < y0 + fold && x - (x1 - fold) <= y0 + fold - y
    ? 1
    : 0
}
function textLineAlpha(x, y) {
  const x0 = dCx - dW / 2 + 42
  const rows = [dCy - 96, dCy - 26, dCy + 44, dCy + 114]
  for (let li = 0; li < rows.length; li++) {
    const w = li === rows.length - 1 ? 132 : 208
    if (x >= x0 && x <= x0 + w && Math.abs(y - rows[li]) <= 13) return 1
  }
  return 0
}

/* ---------- Ring (rotierte Ellipse als Band, Gold-Verlauf) ---------- */
const ringAngle = (-18 * Math.PI) / 180
const RA = 452
const RB = 150
const RBand = 0.052
const cosA = Math.cos(ringAngle)
const sinA = Math.sin(ringAngle)
const ringCy = dCy - 6
const gold1 = [255, 233, 168] // hell
const gold2 = [240, 165, 46] // sattes Gold
function ringSample(x, y) {
  const dx = x - dCx
  const dy = y - ringCy
  const lx = (dx * cosA + dy * sinA) / RA
  const ly = (-dx * sinA + dy * cosA) / RB
  const rr = Math.sqrt(lx * lx + ly * ly)
  const dist = Math.abs(rr - 1)
  if (dist > RBand) return null
  const soft = 1 - dist / RBand
  const t = clamp01((lx + 1) / 2)
  return {
    a: soft * 0.96,
    c: [
      Math.round(lerp(gold1[0], gold2[0], t)),
      Math.round(lerp(gold1[1], gold2[1], t)),
      Math.round(lerp(gold1[2], gold2[2], t))
    ]
  }
}

/* ---------- Rendern ---------- */
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const m = roundRectAlpha(x, y)
    if (m <= 0) continue

    // Hintergrund-Verlauf
    const tg = clamp01((x + y) / (2 * S))
    let r = lerp(bgTop[0], bgBot[0], tg)
    let g = lerp(bgTop[1], bgBot[1], tg)
    let b = lerp(bgTop[2], bgBot[2], tg)
    // Vignette
    const vd = Math.hypot(x - cxAll, y - cyAll) / (S * 0.72)
    const vg = 1 - clamp01(vd) * 0.28
    r *= vg
    g *= vg
    b *= vg
    blend(x, y, r, g, b, m)

    // Sterne
    for (const st of stars) {
      const sd = Math.hypot(x - st.x, y - st.y)
      if (sd < st.r) blend(x, y, 255, 255, 255, st.a * (1 - sd / st.r) * m)
    }

    // Ring hinter dem Dokument
    const rs = ringSample(x, y)
    if (rs) blend(x, y, rs.c[0], rs.c[1], rs.c[2], rs.a * m)

    // Dokument
    if (docShapeAlpha(x, y)) {
      if (textLineAlpha(x, y)) blend(x, y, 150, 170, 210, m)
      else blend(x, y, 255, 255, 255, m)
    } else if (docFoldAlpha(x, y)) {
      blend(x, y, 210, 216, 232, m)
    }

    // Ring-Vorderteil (vor dem Dokument, untere Hälfte)
    if (y > ringCy && rs) blend(x, y, rs.c[0], rs.c[1], rs.c[2], rs.a * m)
  }
}

/* ---------- PNG ---------- */
function crc32(bytes) {
  let c = ~0
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td) >>> 0)
  return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8
ihdr[9] = 6
const raw = Buffer.alloc(S * (S * 4 + 1))
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4)
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../resources/icon.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log('wrote', out, png.length, 'bytes')
