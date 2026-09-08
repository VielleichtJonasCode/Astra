/**
 * Erzeugt test/beispiel-mit-bild.pdf – ein mehrseitiges Test-PDF mit
 * eingebetteten Bildern (synthetische Grafik + App-Icon) und Text.
 * Ohne externe Bild-Bibliothek: enthält einen kleinen PNG-Encoder.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* ---------- Mini-PNG-Encoder (RGBA) ---------- */
function crc32(b) {
  let c = ~0
  for (let i = 0; i < b.length; i++) {
    c ^= b[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td) >>> 0)
  return Buffer.concat([len, td, crc])
}
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------- Synthetische Grafik ---------- */
function makeGraphic(W, H) {
  const buf = Buffer.alloc(W * H * 4)
  const put = (x, y, r, g, b) => {
    const i = (y * W + x) * 4
    buf[i] = r
    buf[i + 1] = g
    buf[i + 2] = b
    buf[i + 3] = 255
  }
  const circles = [
    { x: W * 0.28, y: H * 0.4, r: H * 0.34, c: [255, 149, 10] },
    { x: W * 0.62, y: H * 0.62, r: H * 0.4, c: [10, 132, 255] },
    { x: W * 0.8, y: H * 0.28, r: H * 0.22, c: [48, 209, 88] }
  ]
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = y / H
      let r = Math.round(28 + 20 * (1 - t))
      let g = Math.round(28 + 24 * (1 - t))
      let b = Math.round(38 + 40 * (1 - t))
      for (const c of circles) {
        const d = Math.hypot(x - c.x, y - c.y)
        if (d < c.r) {
          const k = 0.55 * (1 - d / c.r)
          r = Math.round(r * (1 - k) + c.c[0] * k)
          g = Math.round(g * (1 - k) + c.c[1] * k)
          b = Math.round(b * (1 - k) + c.c[2] * k)
        }
      }
      put(x, y, r, g, b)
    }
  }
  return encodePng(W, H, buf)
}

/* ---------- PDF bauen ---------- */
const doc = await PDFDocument.create()
doc.setTitle('Astra – Testdokument mit Bild')
doc.setAuthor('Astra')
doc.setSubject('Beispiel zum Ausprobieren von Bild-, Text- und Seitenwerkzeugen')
doc.setKeywords(['test', 'bild', 'beispiel'])

const font = await doc.embedFont(StandardFonts.Helvetica)
const bold = await doc.embedFont(StandardFonts.HelveticaBold)

const graphic = await doc.embedPng(makeGraphic(900, 560))
let icon = null
try {
  icon = await doc.embedPng(readFileSync(resolve(root, 'resources/icon.png')))
} catch {
  /* Icon optional */
}

const A4 = [595.28, 841.89]
const ink = rgb(0.12, 0.12, 0.14)
const grey = rgb(0.4, 0.4, 0.42)

// Seite 1 – Text + synthetische Grafik
{
  const p = doc.addPage(A4)
  p.drawText('Astra', { x: 60, y: 770, size: 30, font: bold, color: ink })
  p.drawText('Testdokument mit eingebettetem Bild', { x: 60, y: 742, size: 13, font, color: grey })
  const lines = [
    'Dieses PDF dient zum Ausprobieren der Bild-, Text- und Seitenwerkzeuge.',
    'Auf dieser Seite ist eine synthetisch erzeugte Grafik eingebettet (PNG).',
    'Suchbegriff zum Testen der Volltextsuche: Regenschirm.'
  ]
  lines.forEach((l, i) => p.drawText(l, { x: 60, y: 700 - i * 22, size: 12, font, color: ink }))
  p.drawImage(graphic, { x: 60, y: 250, width: 475, height: 296 })
  p.drawText('Abb. 1 – synthetische Grafik', { x: 60, y: 232, size: 9, font, color: grey })
  p.drawText('Seite 1 von 3', { x: 60, y: 50, size: 9, font, color: grey })
}

// Seite 2 – App-Icon als Bild + Text
{
  const p = doc.addPage(A4)
  p.drawText('Seite 2 – Bild aus Datei', { x: 60, y: 770, size: 20, font: bold, color: ink })
  p.drawText('Hier ist das App-Icon als PNG eingebettet. Ideal zum Testen von', {
    x: 60,
    y: 730,
    size: 12,
    font,
    color: ink
  })
  p.drawText('Verschieben, Skalieren und Export als Bild.', { x: 60, y: 712, size: 12, font, color: ink })
  if (icon) p.drawImage(icon, { x: 200, y: 430, width: 220, height: 220 })
  p.drawText('Zweiter Suchbegriff: Regenschirm taucht hier nochmals auf.', {
    x: 60,
    y: 380,
    size: 12,
    font,
    color: ink
  })
  p.drawText('Seite 2 von 3', { x: 60, y: 50, size: 9, font, color: grey })
}

// Seite 3 – großflächiges Bild (für OCR / Zuschneiden)
{
  const p = doc.addPage(A4)
  p.drawImage(graphic, { x: 40, y: 120, width: 515, height: 640 })
  p.drawText('Seite 3 – ganzseitiges Bild', { x: 40, y: 780, size: 16, font: bold, color: ink })
  p.drawText('Seite 3 von 3', { x: 40, y: 50, size: 9, font, color: grey })
}

const out = resolve(root, 'test/beispiel-mit-bild.pdf')
mkdirSync(dirname(out), { recursive: true })
const bytes = await doc.save()
writeFileSync(out, bytes)
console.log(`geschrieben: ${out} (${(bytes.length / 1024).toFixed(1)} KB, 3 Seiten)`)
