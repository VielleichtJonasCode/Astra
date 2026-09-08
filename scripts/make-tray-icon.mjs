/**
 * Erzeugt das Menüleisten-Vorlagen-Icon (Checkliste, monochrom) als
 * 16px + 32px PNG und gibt die base64-Strings aus. Die Strings sind in
 * src/main/tray.ts eingebettet (ICON_16 / ICON_32) – bei Design-Änderung
 * `npm run tray-icon` laufen lassen und dort ersetzen.
 */
import zlib from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([t, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
/** Alpha (0/255) an Pixel (x,y) für eine s×s-Checkliste: 3 Kästchen + Balken. */
function alphaAt(x, y, s) {
  const u = s / 16
  for (const ry of [3.5, 8, 12.5]) {
    const cy = ry * u
    if (x >= 1.5 * u && x < 4.5 * u && y >= cy - 1.5 * u && y < cy + 1.5 * u) {
      const bx = x - 1.5 * u
      const by = y - (cy - 1.5 * u)
      const w = 3 * u
      const b = Math.max(1, u)
      if (bx < b || bx >= w - b || by < b || by >= w - b) return 255
    }
    if (x >= 6 * u && x < 14 * u && y >= cy - u && y < cy + u) return 255
  }
  return 0
}
function png(size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 4 // color type: grayscale + alpha
  const raw = Buffer.alloc((size * 2 + 1) * size)
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      raw[o++] = 0 // gray = schwarz (Vorlagen-Icon)
      raw[o++] = alphaAt(x + 0.5, y + 0.5, size)
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

mkdirSync(join(root, 'resources'), { recursive: true })
const p16 = png(16)
const p32 = png(32)
writeFileSync(join(root, 'resources/trayTemplate.png'), p16)
writeFileSync(join(root, 'resources/trayTemplate@2x.png'), p32)
console.log('geschrieben: resources/trayTemplate.png (+@2x)')
console.log('\nICON_16 =', JSON.stringify(p16.toString('base64')))
console.log('ICON_32 =', JSON.stringify(p32.toString('base64')))
