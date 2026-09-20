import { bytesToBlob } from '../lib/bytes'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml'
}

async function decode(bytes: Uint8Array, srcMime: string): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(bytesToBlob(bytes, srcMime || 'image/png'))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    // JPEG/BMP haben keinen Alpha – weißen Hintergrund setzen
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 24-bit-BMP-Encoder (Chromium kann BMP nicht per toBlob schreiben). */
function encodeBmp(canvas: HTMLCanvasElement): Uint8Array {
  const { width: w, height: h } = canvas
  const data = canvas.getContext('2d')!.getImageData(0, 0, w, h).data
  const rowSize = Math.floor((24 * w + 31) / 32) * 4
  const pixelArraySize = rowSize * h
  const fileSize = 54 + pixelArraySize
  const buf = new Uint8Array(fileSize)
  const dv = new DataView(buf.buffer)
  dv.setUint16(0, 0x4d42, true) // 'BM'
  dv.setUint32(2, fileSize, true)
  dv.setUint32(10, 54, true)
  dv.setUint32(14, 40, true)
  dv.setInt32(18, w, true)
  dv.setInt32(22, h, true)
  dv.setUint16(26, 1, true)
  dv.setUint16(28, 24, true)
  dv.setUint32(34, pixelArraySize, true)
  for (let y = 0; y < h; y++) {
    let off = 54 + (h - 1 - y) * rowSize
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      buf[off++] = data[i + 2]
      buf[off++] = data[i + 1]
      buf[off++] = data[i]
    }
  }
  return buf
}

function canvasToBytes(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Encode fehlgeschlagen'))
        blob.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)))
      },
      mime,
      quality
    )
  })
}

export async function convertImage(
  bytes: Uint8Array,
  srcExt: string,
  targetExt: string,
  opts: { quality?: number } = {}
): Promise<Uint8Array> {
  const canvas = await decode(bytes, MIME[srcExt] ?? '')
  const t = targetExt.toLowerCase()
  if (t === 'bmp') return encodeBmp(canvas)
  const mime = MIME[t] ?? 'image/png'
  return canvasToBytes(canvas, mime, opts.quality ?? 0.92)
}

/** Nur die Pixelmaße auslesen (für die Seiten-Ausrichtung bei Bild→PDF). */
export async function imageSize(
  bytes: Uint8Array,
  srcExt: string
): Promise<{ w: number; h: number }> {
  const c = await decode(bytes, MIME[srcExt] ?? '')
  return { w: c.width, h: c.height }
}
