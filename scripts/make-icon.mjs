/**
 * Erzeugt resources/icon.png (1024×1024) ohne externe Abhängigkeiten:
 * abgerundetes Quadrat mit Verlauf + stilisierte Seite. Reiner PNG-Encoder.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const S = 1024
const buf = Buffer.alloc(S * S * 4)

const lerp = (a, b, t) => a + (b - a) * t
const set = (x, y, r, g, b, a) => {
  const i = (y * S + x) * 4
  buf[i] = r
  buf[i + 1] = g
  buf[i + 2] = b
  buf[i + 3] = a
}

// Hintergrund: diagonaler Verlauf Violett → Blau
const c1 = [94, 92, 230] // #5e5ce6
const c2 = [10, 124, 255] // #0a7cff
const radius = 224
const inset = 96

function inRoundRect(x, y) {
  const x0 = inset
  const y0 = inset
  const x1 = S - inset
  const y1 = S - inset
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.min(Math.max(x, x0 + radius), x1 - radius)
  const cy = Math.min(Math.max(y, y0 + radius), y1 - radius)
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 || (x >= x0 + radius && x <= x1 - radius) || (y >= y0 + radius && y <= y1 - radius)
}

// Seiten-Glyph (weißes Blatt mit Eselsohr)
function inPage(x, y) {
  const px0 = 372
  const px1 = 652
  const py0 = 300
  const py1 = 724
  const fold = 92
  if (x < px0 || x > px1 || y < py0 || y > py1) return false
  // Eselsohr oben rechts abschneiden
  if (x > px1 - fold && y < py0 + fold && x - (px1 - fold) > py0 + fold - y) return false
  return true
}
function inFold(x, y) {
  const px1 = 652
  const py0 = 300
  const fold = 92
  return (
    x > px1 - fold &&
    x <= px1 &&
    y >= py0 &&
    y < py0 + fold &&
    x - (px1 - fold) <= py0 + fold - y
  )
}
function inTextLine(x, y) {
  const lines = [430, 500, 570, 640]
  for (const ly of lines) {
    const w = ly === 640 ? 150 : 210
    if (x >= 410 && x <= 410 + w && Math.abs(y - ly) <= 16) return true
  }
  return false
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (!inRoundRect(x, y)) {
      set(x, y, 0, 0, 0, 0)
      continue
    }
    const t = (x + y) / (2 * S)
    let r = Math.round(lerp(c1[0], c2[0], t))
    let g = Math.round(lerp(c1[1], c2[1], t))
    let b = Math.round(lerp(c1[2], c2[2], t))
    if (inPage(x, y)) {
      if (inTextLine(x, y)) {
        r = 120
        g = 150
        b = 210
      } else {
        r = g = b = 255
      }
    } else if (inFold(x, y)) {
      r = g = b = 205
    }
    set(x, y, r, g, b, 255)
  }
}

// PNG schreiben
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td) >>> 0)
  return Buffer.concat([len, td, crc])
}
function crc32(b) {
  let c = ~0
  for (let i = 0; i < b.length; i++) {
    c ^= b[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c
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
